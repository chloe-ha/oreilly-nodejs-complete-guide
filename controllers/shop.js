const fs = require('fs');
const path = require('path');

const PDFDocument = require('pdfkit');
const stripe = require('stripe')(process.env.STRIPE_KEY);

const Product = require('../models/product');
const Order = require('../models/order');

const ITEMS_PER_PAGE = 2;

module.exports.getIndex = (req, res, next) => {
  const page = Number(req.query.page) || 1;

  Product.find()
    .countDocuments()
    .then((count) => {
      return Product.find()
        .skip((page - 1) * ITEMS_PER_PAGE)
        .limit(ITEMS_PER_PAGE)
        .then((products) => {
          res.render('shop/index', {
            pageTitle: 'Shop',
            path: '/',
            prods: products,
            currentPage: page,
            hasNextPage: ITEMS_PER_PAGE * page < count,
            hasPreviousPage: page > 1,
            nextPage: page + 1,
            previousPage: page - 1,
            lastPage: Math.ceil(count / ITEMS_PER_PAGE),
          });
        });
    })
    .catch((err) => next(err));
};

module.exports.getProducts = (req, res, next) => {
  const page = Number(req.query.page) || 1;

  Product.find()
    .countDocuments()
    .then((count) => {
      return Product.find()
        .skip((page - 1) * ITEMS_PER_PAGE)
        .limit(ITEMS_PER_PAGE)
        .then((products) => {
          res.render('shop/product-list', {
            pageTitle: 'All Products',
            path: '/products',
            prods: products,
            currentPage: page,
            hasNextPage: ITEMS_PER_PAGE * page < count,
            hasPreviousPage: page > 1,
            nextPage: page + 1,
            previousPage: page - 1,
            lastPage: Math.ceil(count / ITEMS_PER_PAGE),
          });
        });
    })
    .catch((err) => next(err));
};

module.exports.getProduct = (req, res, next) => {
  const prodId = req.params.productId;

  Product.findById(prodId)
    .then((product) => {
      res.render('shop/product-detail', {
        product: product,
        pageTitle: product.title,
        path: '/products',
      });
    })
    .catch((err) => next(err));
};

module.exports.getCart = (req, res, next) => {
  req.user
    .populate('cart.items.productId')
    .then((user) => {
      res.render('shop/cart', {
        path: '/cart',
        pageTitle: 'Your Cart',
        products: user.cart.items,
      });
    })
    .catch((err) => next(err));
};

exports.postCart = (req, res, next) => {
  const prodId = req.body.productId;
  Product.findById(prodId)
    .then((product) => req.user.addToCart(product))
    .then(() => res.redirect('/cart'))
    .catch((err) => next(err));
};

exports.postCartDeleteProduct = (req, res, next) => {
  const prodId = req.body.productId;
  req.user
    .removeFromCart(prodId)
    .then(() => res.redirect('/cart'))
    .catch((err) => next(err));
};

exports.getCheckout = (req, res, next) => {
  req.user
    .populate('cart.items.productId')
    .then((user) => {
      const products = user.cart.items;
      const total = products.reduce((prev, curr) => prev + curr.productId.price * curr.quantity, 0);
      return res.render('shop/checkout', {
        path: '/checkout',
        pageTitle: 'Checkout',
        products: products,
        totalSum: total,
      });
    })
    .catch((err) => next(err));
};

exports.getOrders = (req, res, next) => {
  Order.find({ userId: req.user._id })
    .then((orders) => {
      res.render('shop/orders', {
        path: '/orders',
        pageTitle: 'Your Orders',
        orders,
      });
    })
    .catch((err) => next(err));
};

exports.postOrder = (req, res, next) => {
  const token = req.body.stripeToken;
  let totalSum = 0;

  req.user
    .populate('cart.items.productId')
    .then((user) => {
      const products = user.cart.items;
      totalSum = products.reduce((prev, curr) => prev + curr.productId.price * curr.quantity, 0);

      return new Order({
        user: { email: user.email, userId: user },
        products: products.map((item) => ({
          product: item.productId._doc,
          quantity: item.quantity,
        })),
      }).save();
    })
    .then((result) => {
      const charge = stripe.charges.create({
        amount: Number((totalSum * 100).toFixed(0)),
        currency: 'aud',
        description: 'Demo Order',
        source: token,
        metadata: { order_id: result._id.toString() },
      });
    })
    .then(() => req.user.clearCart())
    .then(() => res.redirect('/orders'))
    .catch((err) => next(err));
};

exports.getInvoice = (req, res, next) => {
  const orderId = req.params.orderId;
  const invoiceFilename = 'invoice.pdf';
  const invoicePath = path.join('data', 'invoices', invoiceFilename);

  Order.findById(orderId)
    .then((order) => {
      if (!order) {
        return next(new Error('No order found'));
      }
      if (order.user.userId.toString() !== req.user._id.toString()) {
        return next(new Error('Unauthorised'));
      }
      // Bad practice: read data, then serve it
      // fs.readFile(invoicePath, (err, data) => {
      //   if (err) {
      //     return next(err);
      //   }
      //   res.setHeader('Content-Type', 'application/pdf');
      //   res.setHeader('Content-Disposition', 'attachment; filename="' + invoiceFilename + '"');
      //   // res.setHeader('Content-Disposition', 'inline');
      //   res.send(data);
      // });

      // Better practice: stream data
      // const file = fs.createReadStream(invoicePath);
      // res.setHeader('Content-Type', 'application/pdf');
      // res.setHeader('Content-Disposition', 'attachment; filename="' + invoiceFilename + '"');
      // file.pipe(res);

      // Create our own PDF document
      const pdfDoc = new PDFDocument();
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename="' + invoiceFilename + '"');
      pdfDoc.pipe(fs.createWriteStream(invoicePath));
      pdfDoc.pipe(res);

      pdfDoc.fontSize(26).text('Invoice', {
        underline: true,
      });
      pdfDoc.fontSize(14).text(`Order ${orderId}`);
      pdfDoc.text('----------------------');
      let totalPrice = 0;
      order.products.forEach((product) => {
        const productPrice = product.product.price * product.quantity;
        pdfDoc.text(
          `${product.product.title}: ${product.product.price} x ${product.quantity} = ${productPrice}`,
        );
        totalPrice += productPrice;
      });
      pdfDoc.text(`Total: ${totalPrice}`);

      pdfDoc.end();
    })
    .catch((err) => next(err));
};
