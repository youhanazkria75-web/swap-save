function tokenize(text) {
  return text
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
}

function similarity(a, b) {
  const tokensA = tokenize(a);
  const tokensB = tokenize(b);

  const intersection = tokensA.filter(word => tokensB.includes(word));
  const union = new Set([...tokensA, ...tokensB]);

  return union.size === 0 ? 0 : intersection.length / union.size;
}

module.exports = similarity;