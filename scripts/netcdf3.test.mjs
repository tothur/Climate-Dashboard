import assert from "node:assert/strict";
import { test } from "node:test";

import {
  NetcdfHeaderTruncatedError,
  decodeNetcdfValues,
  oneDimensionalVariableRanges,
  parseNetcdf3Header,
} from "./netcdf3.mjs";

const NC_DOUBLE = 6;
const NC_FLOAT = 5;
const NC_CHAR = 2;
const TYPE_SIZES = { [NC_CHAR]: 1, [NC_FLOAT]: 4, [NC_DOUBLE]: 8 };

// Builds a small big-endian netCDF-3 classic file shaped like CERES EBAF: a time
// coordinate, a global-mean series, and a gridded field that makes each record
// larger than the two series values.
function buildNetcdf({ timeIsRecord, times, fluxes, gridSize = 3 }) {
  const parts = [];
  const u32 = (value) => {
    const bytes = new Uint8Array(4);
    new DataView(bytes.buffer).setUint32(0, value, false);
    parts.push(bytes);
  };
  const padded = (bytes) => {
    parts.push(bytes);
    const padding = (4 - (bytes.length % 4)) % 4;
    if (padding) parts.push(new Uint8Array(padding));
  };
  const name = (text) => {
    const bytes = new TextEncoder().encode(text);
    u32(bytes.length);
    padded(bytes);
  };
  const charAttribute = (attributeName, text) => {
    name(attributeName);
    u32(NC_CHAR);
    const bytes = new TextEncoder().encode(text);
    u32(bytes.length);
    padded(bytes);
  };
  const values = (type, list) => {
    const size = TYPE_SIZES[type];
    const bytes = new Uint8Array(size * list.length);
    const view = new DataView(bytes.buffer);
    list.forEach((value, index) => {
      if (type === NC_DOUBLE) view.setFloat64(index * size, value, false);
      else view.setFloat32(index * size, value, false);
    });
    return bytes;
  };

  const recordCount = times.length;
  const variables = [
    { name: "time", dims: [0], type: NC_DOUBLE, units: "days since 2000-03-01 00:00:00" },
    { name: "gtoa_net_all_mon", dims: [0], type: NC_FLOAT },
    { name: "toa_net_all_mon", dims: [0, 1], type: NC_FLOAT },
  ];
  const vsizeOf = (variable) =>
    (variable.dims.includes(1) ? gridSize : 1) * TYPE_SIZES[variable.type] * (timeIsRecord ? 1 : recordCount);

  // Header length does not depend on the begin offsets, so build it twice.
  const writeHeader = (begins) => {
    parts.length = 0;
    parts.push(new Uint8Array([0x43, 0x44, 0x46, 0x01]));
    u32(timeIsRecord ? recordCount : 0);
    u32(0x0a);
    u32(2);
    name("time");
    u32(timeIsRecord ? 0 : recordCount);
    name("lat");
    u32(gridSize);
    u32(0);
    u32(0);
    u32(0x0b);
    u32(variables.length);
    variables.forEach((variable, index) => {
      name(variable.name);
      u32(variable.dims.length);
      variable.dims.forEach((dim) => u32(dim));
      if (variable.units) {
        u32(0x0c);
        u32(1);
        charAttribute("units", variable.units);
      } else {
        u32(0);
        u32(0);
      }
      u32(variable.type);
      u32(vsizeOf(variable));
      u32(begins[index]);
    });
    return parts.reduce((length, part) => length + part.length, 0);
  };

  const headerLength = writeHeader([0, 0, 0]);
  const begins = [];
  let cursor = headerLength;
  for (const variable of variables) {
    begins.push(cursor);
    cursor += vsizeOf(variable);
  }
  writeHeader(begins);

  const grid = (record) => Array.from({ length: gridSize }, (_, index) => record * 10 + index);
  if (timeIsRecord) {
    for (let record = 0; record < recordCount; record += 1) {
      parts.push(values(NC_DOUBLE, [times[record]]));
      parts.push(values(NC_FLOAT, [fluxes[record]]));
      parts.push(values(NC_FLOAT, grid(record)));
    }
  } else {
    parts.push(values(NC_DOUBLE, times));
    parts.push(values(NC_FLOAT, fluxes));
    parts.push(values(NC_FLOAT, times.flatMap((_, record) => grid(record))));
  }

  const file = new Uint8Array(parts.reduce((length, part) => length + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    file.set(part, offset);
    offset += part.length;
  }
  return { file, headerLength };
}

function readVariable(file, header, variableName) {
  const { variable, ranges } = oneDimensionalVariableRanges(header, variableName);
  return ranges.flatMap((range) =>
    decodeNetcdfValues(file.subarray(range.start, range.start + range.length), variable.type)
  );
}

const TIMES = [14.5, 45, 74.5];
const FLUXES = [0.75, -0.5, 1.25];

test("netCDF-3 record variables are read one record at a time past the gridded fields", () => {
  const { file } = buildNetcdf({ timeIsRecord: true, times: TIMES, fluxes: FLUXES });
  const header = parseNetcdf3Header(file);

  assert.equal(header.numrecs, 3);
  assert.equal(header.recordSize, 8 + 4 + 12);
  assert.equal(header.variables.find((variable) => variable.name === "time").attributes.units, "days since 2000-03-01 00:00:00");
  assert.equal(oneDimensionalVariableRanges(header, "gtoa_net_all_mon").ranges.length, 3);
  assert.deepEqual(readVariable(file, header, "time"), TIMES);
  assert.deepEqual(readVariable(file, header, "gtoa_net_all_mon"), FLUXES);
});

test("netCDF-3 fixed-size variables are read as one contiguous range", () => {
  const { file } = buildNetcdf({ timeIsRecord: false, times: TIMES, fluxes: FLUXES });
  const header = parseNetcdf3Header(file);

  assert.equal(header.numrecs, 0);
  assert.deepEqual(oneDimensionalVariableRanges(header, "gtoa_net_all_mon").ranges.length, 1);
  assert.deepEqual(readVariable(file, header, "time"), TIMES);
  assert.deepEqual(readVariable(file, header, "gtoa_net_all_mon"), FLUXES);
});

test("a netCDF-3 prefix that ends inside the header asks for more bytes", () => {
  const { file, headerLength } = buildNetcdf({ timeIsRecord: true, times: TIMES, fluxes: FLUXES });

  assert.throws(() => parseNetcdf3Header(file.subarray(0, headerLength - 4)), NetcdfHeaderTruncatedError);
  assert.equal(parseNetcdf3Header(file.subarray(0, headerLength)).headerLength, headerLength);
  assert.throws(() => parseNetcdf3Header(new TextEncoder().encode("<html>login</html>")), /Not a netCDF-3 file/);
});

test("gridded or missing variables are rejected rather than misread", () => {
  const { file } = buildNetcdf({ timeIsRecord: true, times: TIMES, fluxes: FLUXES });
  const header = parseNetcdf3Header(file);

  assert.throws(() => oneDimensionalVariableRanges(header, "toa_net_all_mon"), /not one-dimensional/);
  assert.throws(() => oneDimensionalVariableRanges(header, "missing"), /not found/);
});
