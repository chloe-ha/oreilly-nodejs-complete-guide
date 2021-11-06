const fs = require('fs');
const path = require('path');

const express = require('express');
const multer = require('multer');
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
const shopController = require('./controllers/shop');
const isAuth = require('./middleware/is-auth');

const User = require('./models/user');

const MONGODB_URI = 'mongodb+srv://user:user@cluster0.psshf.mongodb.net/shop';

const app = express();
const store = new MongoDBStore({
  uri: MONGODB_URI,
  collection: 'sessions'
});

const csrfProtection = csrf();
const fileStorage = multer.diskStorage({
  destination: (req, file, callback) => {
    callback(null, 'images')
  },
  filename: (req, file, callback) => {
    callback(null, `${Date.now()}_${file.originalname}`)
  }
});
const fileFilter = (req, file, callback) => {
  if (['image/png', 'image/jpg', 'image/jpeg'].includes(file.mimetype)) {
    callback(null, true);
  } else {
    callback(null, false);
  }
};

app.set('view engine', 'ejs');
app.set('views', 'views'); // default

app.use(express.urlencoded({ extended: false }));
app.use(multer({ storage: fileStorage, fileFilter }).single('image'));

app.use(express.static(path.join(rootDir, 'public')));
app.use('/images', express.static(path.join(rootDir, 'images')));

app.use(session({ secret: 'mysecret', resave: false, saveUninitialized: false, store: store }));
app.use(flash());
app.use(morgan('combined', { stream: accessLogStream }));

app.use((req, res, next) => {
  res.locals.isAuthenticated = req.session.isLoggedIn;
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

app.post('/create-order', isAuth, shopController.postOrder);
app.use(csrfProtection);

app.use((req, res, next) => {
  res.locals.csrfToken = req.csrfToken();
  next();
});

app.use(authRoutes);
app.use('/admin', adminRoutes);
app.use(shopRoutes);
app.get('/500', errorController.get500);
app.use(errorController.get404);

app.use((error, req, res, next) => {
  console.log('error middleware', error);
  return res.status(500).render('500', {
    pageTitle: "Error 500",
    path: ''
  });
});

mongoose.connect(MONGODB_URI, { })
  .then(() => {
    console.log('Connected to MongoDB');
    app.listen(4000);
  })
  .catch(err => console.log(err));
