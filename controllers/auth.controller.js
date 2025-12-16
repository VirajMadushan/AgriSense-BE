const AuthService = require("../services/auth.service");

exports.login = (req, res) => {
  const { email, password } = req.body;

  const result = AuthService.login(email, password);

  if (result.error) {
    return res.status(400).json({ message: result.error });
  }

  res.json(result);
};
