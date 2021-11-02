const fs = require('fs');
const path = require('path');

const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const MongoDBStore = require('connect-mongodb-session')(session);
const csrf = require('csurf');
const flash = require('connect-flash');
const morgan = require('morgan');

const rootDir = require('./utils/path');

const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const shopRoutes = require('./routes/shop');

const accessLogStream = fs.createWriteStream(
  path.join(__dirname, 'access.log'),
  { flags: 'a' }
);

const errorController = require('./controllers/error');

const User = require('./models/user');

const MONGODB_URI = 'mongodb+srv://user:user@cluster0.psshf.mongodb.net/shop';

const app = express();
const store = new MongoDBStore({
  uri: MONGODB_URI,
  collection: 'sessions'
});

const csrfProtection = csrf();

app.set('view engine', 'ejs');
app.set('views', 'views'); // default

app.use(express.urlencoded({ extended: false }));
// anything that tries to find a static file, Node.js will look in there
app.use(express.static(path.join(rootDir, 'public')));
app.use(session({ secret: 'mysecret', resave: false, saveUninitialized: false, store: store }));
app.use(csrfProtection); // after the session
app.use(flash()); // add stuff to session
app.use(morgan('combined', { stream: accessLogStream }));

// add all of the following to all our render methods
app.use((req, res, next) => {
  res.locals.isAuthenticated = req.session.isLoggedIn;
  res.locals.csrfToken = req.csrfToken();
  next();
});

app.use((req, res, next) => {
  // throw new Error('new error'); <= this will lead to error handling middleware
  if (!req.session.user) {
    return next();
  }
  User.findById(req.session.user._id)
    .then(user => {
      req.user = user;
      next();
    })
    .catch(err => next(err)); // <= this next is needed to lead to error handling middleware
});

app.use(authRoutes);
app.use('/admin', adminRoutes);
app.use(shopRoutes);
app.get('/500', errorController.get500);
app.use(errorController.get404);

app.use((error, req, res, next) => {
  console.log('error middleware', error);
  return res.render('500', {
    pageTitle: "Error 500",
    path: '',
    isAuthenticated: false
  });
});

mongoose.connect(MONGODB_URI, { })
  .then(() => {
    console.log('Connected to MongoDB');
    app.listen(4000);
  })
  .catch(err => console.log(err));
