exports.buildFileUrl = (req, filename) => {
  const baseUrl = `${req.protocol}://${req.get("host")}`;
  return `${baseUrl}/uploads/products/${filename}`;
};

exports.buildAvatarUrl = (req, filename) => {
  const baseUrl = `${req.protocol}://${req.get("host")}`;
  return `${baseUrl}/uploads/avatars/${filename}`;
};
