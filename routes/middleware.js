function isLoggedIn(req, res, next) {
  if (req.session && req.session.user) return next();
  req.flash('error', 'You must be logged in.');
  res.redirect('/auth/login');
}

module.exports = { isLoggedIn }; 