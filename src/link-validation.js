function formatLinkReference(value) {
  if (typeof value === 'undefined') {
    return 'undefined';
  }

  if (value && typeof value === 'object') {
    if ('id' in value && typeof value.id !== 'undefined') {
      return `{ id: ${JSON.stringify(value.id)} }`;
    }

    try {
      return JSON.stringify(value);
    } catch (error) {
      return Object.prototype.toString.call(value);
    }
  }

  return JSON.stringify(value);
}

export function isValidNodeIndex(index, nodeCount) {
  return Number.isInteger(index) && index >= 0 && index < nodeCount;
}

export function createInvalidLinkError(link, linkIndex, nodeCount) {
  const maxIndex = Math.max(nodeCount - 1, 0);
  const issues = [];

  if (!isValidNodeIndex(link.sourceIndex, nodeCount)) {
    issues.push(
      `sourceIndex=${String(link.sourceIndex)} is outside the valid node range [0, ${maxIndex}]`,
    );
  }

  if (!isValidNodeIndex(link.targetIndex, nodeCount)) {
    issues.push(
      `targetIndex=${String(link.targetIndex)} is outside the valid node range [0, ${maxIndex}]`,
    );
  }

  return new Error(
    `Invalid link at data.links[${linkIndex}]: ${issues.join(
      '; ',
    )}. Source=${formatLinkReference(link.source)} Target=${formatLinkReference(
      link.target,
    )}. This usually means the link references an unknown node id or a mutated d3-style link object.`,
  );
}

export function assertValidLink(link, linkIndex, nodeCount) {
  if (!isValidNodeIndex(link.sourceIndex, nodeCount)) {
    throw createInvalidLinkError(link, linkIndex, nodeCount);
  }

  if (!isValidNodeIndex(link.targetIndex, nodeCount)) {
    throw createInvalidLinkError(link, linkIndex, nodeCount);
  }
}
