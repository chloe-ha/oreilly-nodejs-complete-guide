const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const userSchema = new Schema({
  email: { type: String, required: true }, // we can set that to be unique
  password: { type: String, required: true },
  resetToken: String,
  resetTokenExpiry: Date,
  cart: {
    items: [
      {
        productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
        quantity: { type: Number, required: true },
      },
    ],
  },
});

// will be called on a User. Not anonymous function, so this is the User instance
userSchema.methods.addToCart = function (product) {
  const cartProductIndex = this.cart.items.findIndex(
    (i) => i.productId.toString() === product._id.toString(),
  );
  if (cartProductIndex === -1) {
    const updatedCart = { items: [...this.cart.items, { productId: product._id, quantity: 1 }] };
    this.cart = updatedCart;
    return this.save();
  } else {
    const updatedCartItems = [...this.cart.items];
    updatedCartItems[cartProductIndex].quantity += 1;
    this.cart = { items: updatedCartItems };
    return this.save();
  }
};
userSchema.methods.removeFromCart = function (productId) {
  const updatedCartItems = this.cart.items.filter(
    (i) => i.productId.toString() !== productId.toString(),
  );
  this.cart = { items: updatedCartItems };
  return this.save();
};
userSchema.methods.clearCart = function () {
  this.cart = { items: [] };
  return this.save();
};

module.exports = mongoose.model('User', userSchema);
