const crypto = require('crypto');

const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const sendgridTransport = require('nodemailer-sendgrid-transport');
const { validationResult } = require('express-validator');

const User = require('../models/user');

const transporter = nodemailer.createTransport(
  sendgridTransport({
    auth: {
      api_key: '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',
    },
  }),
);

exports.getLogin = (req, res, next) => {
  let infoMessage = req.flash('info');
  if (infoMessage.length > 0) {
    infoMessage = infoMessage[0];
  } else {
    infoMessage = null;
  }
  let errorMessage = req.flash('error');
  if (errorMessage.length > 0) {
    errorMessage = errorMessage[0];
  } else {
    errorMessage = null;
  }
  res.render('auth/login', {
    path: '/login',
    pageTitle: 'Login',
    errorMessage,
    infoMessage,
    oldInput: {
      email: '',
      password: '',
    },
    validationErrors: [],
  });
};

exports.postLogin = (req, res, next) => {
  const { email, password } = req.body;

  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).render('auth/login', {
      path: '/login',
      pageTitle: 'Login',
      errorMessage: errors.array()[0].msg,
      oldInput: {
        email: email,
        password: password,
      },
      validationErrors: errors.array(),
    });
  }

  User.findOne({ email })
    .then((user) => {
      if (!user) {
        return res.status(422).render('auth/login', {
          path: '/login',
          pageTitle: 'Login',
          errorMessage: 'Invalid email or password.',
          oldInput: {
            email: email,
            password: password,
          },
          validationErrors: [],
        });
      }
      return bcrypt.compare(password, user.password).then((doMatch) => {
        if (doMatch) {
          req.session.isLoggedIn = true;
          req.session.user = user;
          return req.session.save(() => res.redirect('/'));
        }
        return res.status(422).render('auth/login', {
          path: '/login',
          pageTitle: 'Login',
          errorMessage: 'Invalid email or password.',
          oldInput: {
            email: email,
            password: password,
          },
          validationErrors: [],
        });
      });
    })
    .catch((err) => next(err));
};

exports.getSignup = (req, res, next) => {
  let flashMessage = req.flash('error');
  if (flashMessage.length > 0) {
    flashMessage = flashMessage[0];
  } else {
    flashMessage = null;
  }
  res.render('auth/signup', {
    path: '/signup',
    pageTitle: 'Signup',
    errorMessage: flashMessage,
    oldInput: {
      email: '',
      password: '',
      confirmPassword: '',
    },
    validationErrors: [],
  });
};

exports.postSignup = (req, res, next) => {
  const { email, password, confirmPassword } = req.body;

  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).render('auth/signup', {
      path: '/signup',
      pageTitle: 'Signup',
      errorMessage: errors.array()[0].msg,
      oldInput: {
        email: email,
        password: password,
        confirmPassword: req.body.confirmPassword,
      },
      validationErrors: errors.array(),
    });
  }

  bcrypt
    .hash(password, 12)
    .then((hashedPassword) => {
      const user = new User({
        email: email,
        password: hashedPassword,
        cart: { items: [] },
      });
      return user.save();
    })
    .then((result) => {
      res.redirect('/login');
      // return transporter.sendMail({
      //   to: email,
      //   from: 'shop@node-complete.com',
      //   subject: 'Signup succeeded!',
      //   html: '<h1>You successfully signed up!</h1>'
      // });
    })
    .catch((err) => next(err));
};
exports.postLogout = (req, res, next) => {
  req.session.destroy((err) => {
    console.log(err);
    res.redirect('/');
  });
};

exports.getReset = (req, res, next) => {
  let infoMessage = req.flash('info');
  if (infoMessage.length > 0) {
    infoMessage = infoMessage[0];
  } else {
    infoMessage = null;
  }
  let errorMessage = req.flash('error');
  if (errorMessage.length > 0) {
    errorMessage = errorMessage[0];
  } else {
    errorMessage = null;
  }
  res.render('auth/reset', {
    path: '/reset',
    pageTitle: 'Reset password',
    errorMessage,
    infoMessage,
  });
};

exports.postReset = (req, res, next) => {
  crypto.randomBytes(32, (err, buff) => {
    if (err) {
      console.log(err);
      return res.redirect('/reset');
    }
    const token = buff.toString('hex');
    const email = req.body.email;
    User.findOne({ email })
      .then((user) => {
        if (!user) {
          req.flash('error', 'No account associated to this email');
          return res.redirect('/reset');
        }
        user.resetToken = token;
        user.resetTokenExpiry = Date.now() + 3600000;
        return user.save();
      })
      .then(() => {
        transporter.sendMail({
          to: email,
          from: 'c.ha@groupeonepoint.com',
          subject: 'Oreillyshop - Reset password requested',
          html: `
            <p>Bonjour</p>
            <p>Click <a href="http://localhost:3000/reset/${token}">here</a> to reset password (valid 1h)</p>
          `,
        });
        req.flash('info', `An email has been sent to ${email}`);
        return res.redirect('/login');
      })
      .catch((err) => next(err));
  });
};

exports.getNewPassword = (req, res, next) => {
  const token = req.params.token;
  User.findOne({ resetToken: token, resetTokenExpiry: { $gt: Date.now() } })
    .then((user) => {
      if (!user) {
        req.flash('error', 'Reset link expired');
        return res.redirect('/reset');
      }
      let errorMessage = req.flash('error');
      if (errorMessage.length > 0) {
        errorMessage = errorMessage[0];
      } else {
        errorMessage = null;
      }
      res.render('auth/new-password', {
        path: '/new-password',
        pageTitle: 'Update password',
        errorMessage,
        userId: user._id.toString(),
        passwordToken: token,
      });
    })
    .catch((err) => next(err));
};

exports.postNewPassword = (req, res, next) => {
  const newPassword = req.body.password;
  const userId = req.body.userId;
  const passwordToken = req.body.passwordToken;

  let resetUser;

  User.findOne({ resetToken: passwordToken, resetTokenExpiry: { $gt: Date.now() }, _id: userId })
    .then((user) => {
      resetUser = user;
      return bcrypt.hash(newPassword, 12);
    })
    .then((hashedPassword) => {
      resetUser.password = hashedPassword;
      resetUser.resetToken = undefined;
      resetUser.resetTokenExpiry = undefined;
      return resetUser.save();
    })
    .then(() => {
      req.flash('info', 'Password was reset!');
      return res.redirect('/login');
    })
    .catch((err) => next(err));
};
