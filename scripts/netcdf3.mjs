// Minimal netCDF-3 (classic and 64-bit offset) header reader. It lets the updater
// pull one small variable out of a large remote file with HTTP range requests
// instead of downloading the whole file.
//
// Format reference: https://docs.unidata.ucar.edu/netcdf-c/current/file_format_specifications.html

const NC_DIMENSION = 0x0a;
const NC_VARIABLE = 0x0b;
const NC_ATTRIBUTE = 0x0c;
const STREAMING_NUMRECS = 0xffffffff;

const TYPE_SIZES = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 4, 6: 8 };

export class NetcdfHeaderTruncatedError extends Error {}

function createReader(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 0;

  function need(length) {
    if (offset + length > bytes.byteLength) {
      throw new NetcdfHeaderTruncatedError(`netCDF header needs more than ${bytes.byteLength} bytes`);
    }
  }

  return {
    get offset() {
      return offset;
    },
    uint32() {
      need(4);
      const value = view.getUint32(offset, false);
      offset += 4;
      return value;
    },
    uint64() {
      need(8);
      const value = Number(view.getBigUint64(offset, false));
      offset += 8;
      return value;
    },
    bytes(length) {
      need(length);
      const slice = bytes.subarray(offset, offset + length);
      offset += length;
      return slice;
    },
    skipPadding(length) {
      const padding = (4 - (length % 4)) % 4;
      need(padding);
      offset += padding;
    },
  };
}

function readName(reader) {
  const length = reader.uint32();
  const name = new TextDecoder().decode(reader.bytes(length));
  reader.skipPadding(length);
  return name;
}

function readAttributeValues(reader, type, count) {
  const size = TYPE_SIZES[type];
  if (!size) throw new Error(`Unsupported netCDF attribute type ${type}`);
  const raw = reader.bytes(size * count);
  reader.skipPadding(size * count);
  if (type === 2) return new TextDecoder().decode(raw).replace(/\0+$/, "");
  return decodeNetcdfValues(raw, type);
}

function readAttributes(reader) {
  const tag = reader.uint32();
  const count = reader.uint32();
  if (tag !== NC_ATTRIBUTE && !(tag === 0 && count === 0)) throw new Error("Malformed netCDF attribute list");
  const attributes = {};
  for (let index = 0; index < count; index += 1) {
    const name = readName(reader);
    const type = reader.uint32();
    const valueCount = reader.uint32();
    attributes[name] = readAttributeValues(reader, type, valueCount);
  }
  return attributes;
}

/**
 * Parses a netCDF-3 header. Throws NetcdfHeaderTruncatedError when `bytes` ends
 * before the header does, so callers can fetch a longer prefix and retry.
 */
export function parseNetcdf3Header(bytes) {
  const reader = createReader(bytes);
  const magic = reader.bytes(4);
  if (magic[0] !== 0x43 || magic[1] !== 0x44 || magic[2] !== 0x46) throw new Error("Not a netCDF-3 file");
  const version = magic[3];
  if (version !== 1 && version !== 2) throw new Error(`Unsupported netCDF-3 version ${version}`);

  const numrecs = reader.uint32();

  const dimTag = reader.uint32();
  const dimCount = reader.uint32();
  if (dimTag !== NC_DIMENSION && !(dimTag === 0 && dimCount === 0)) throw new Error("Malformed netCDF dimension list");
  const dimensions = [];
  for (let index = 0; index < dimCount; index += 1) {
    const name = readName(reader);
    const length = reader.uint32();
    dimensions.push({ name, length, isRecord: length === 0 });
  }

  const attributes = readAttributes(reader);

  const varTag = reader.uint32();
  const varCount = reader.uint32();
  if (varTag !== NC_VARIABLE && !(varTag === 0 && varCount === 0)) throw new Error("Malformed netCDF variable list");
  const variables = [];
  for (let index = 0; index < varCount; index += 1) {
    const name = readName(reader);
    const rank = reader.uint32();
    const dimensionIds = [];
    for (let dim = 0; dim < rank; dim += 1) dimensionIds.push(reader.uint32());
    const variableAttributes = readAttributes(reader);
    const type = reader.uint32();
    const vsize = reader.uint32();
    const begin = version === 2 ? reader.uint64() : reader.uint32();
    const isRecord = dimensionIds.length > 0 && dimensions[dimensionIds[0]]?.isRecord === true;
    variables.push({ name, dimensionIds, attributes: variableAttributes, type, vsize, begin, isRecord });
  }

  const recordVariables = variables.filter((variable) => variable.isRecord);
  // With a single record variable the record is not padded to four bytes.
  const recordSize =
    recordVariables.length === 1
      ? recordVariables[0].dimensionIds
          .slice(1)
          .reduce((size, dimId) => size * dimensions[dimId].length, TYPE_SIZES[recordVariables[0].type])
      : recordVariables.reduce((size, variable) => size + variable.vsize, 0);

  return {
    version,
    numrecs: numrecs === STREAMING_NUMRECS ? null : numrecs,
    dimensions,
    attributes,
    variables,
    recordSize,
    headerLength: reader.offset,
  };
}

export function decodeNetcdfValues(raw, type) {
  const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  const size = TYPE_SIZES[type];
  const values = [];
  for (let offset = 0; offset + size <= raw.byteLength; offset += size) {
    if (type === 1) values.push(view.getInt8(offset));
    else if (type === 3) values.push(view.getInt16(offset, false));
    else if (type === 4) values.push(view.getInt32(offset, false));
    else if (type === 5) values.push(view.getFloat32(offset, false));
    else if (type === 6) values.push(view.getFloat64(offset, false));
    else throw new Error(`Unsupported netCDF value type ${type}`);
  }
  return values;
}

/**
 * Byte ranges that hold a one-dimensional variable: one contiguous range for a
 * fixed-size variable, or one small range per record for a record variable.
 */
export function oneDimensionalVariableRanges(header, variableName) {
  const variable = header.variables.find((candidate) => candidate.name === variableName);
  if (!variable) throw new Error(`netCDF variable ${variableName} not found`);
  if (variable.dimensionIds.length !== 1) throw new Error(`netCDF variable ${variableName} is not one-dimensional`);
  const valueSize = TYPE_SIZES[variable.type];
  if (!valueSize) throw new Error(`Unsupported netCDF value type ${variable.type}`);

  if (!variable.isRecord) {
    const length = header.dimensions[variable.dimensionIds[0]].length * valueSize;
    return { variable, ranges: [{ start: variable.begin, length }] };
  }

  if (header.numrecs == null) throw new Error("Streaming netCDF files are not supported");
  const ranges = [];
  for (let record = 0; record < header.numrecs; record += 1) {
    ranges.push({ start: variable.begin + record * header.recordSize, length: valueSize });
  }
  return { variable, ranges };
}
