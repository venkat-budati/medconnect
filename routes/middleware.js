function isLoggedIn(req, res, next) {
  console.log('isLoggedIn middleware check:');
  console.log('- Session exists:', !!req.session);
  console.log('- Session user:', req.session ? req.session.user : 'No session');
  console.log('- Session ID:', req.session ? req.session.id : 'No session ID');
  
  if (req.session && req.session.user) {
    console.log('User is logged in, proceeding...');
    return next();
  }
  
  console.log('User is not logged in, redirecting to login...');
  req.flash('error', 'You must be logged in.');
  res.redirect('/auth/login');
}

module.exports = { isLoggedIn }; 