const COIN_PACKAGES = Object.freeze([
  Object.freeze({
    id: "coins_100",
    name: "Starter",
    coins: 100,
    priceEGP: 50,
    isPopular: false,
  }),
  Object.freeze({
    id: "coins_300",
    name: "Plus",
    coins: 300,
    priceEGP: 140,
    isPopular: true,
  }),
  Object.freeze({
    id: "coins_700",
    name: "Pro",
    coins: 700,
    priceEGP: 300,
    isPopular: false,
  }),
  Object.freeze({
    id: "coins_1500",
    name: "Elite",
    coins: 1500,
    priceEGP: 600,
    isPopular: false,
  }),
]);

const COIN_PACKAGE_MAP = Object.freeze(
  COIN_PACKAGES.reduce((map, coinPackage) => {
    map[coinPackage.id] = coinPackage;
    return map;
  }, {})
);

const getCoinPackage = (packageId) => COIN_PACKAGE_MAP[packageId] || null;

const serializeCoinPackage = (coinPackage) => ({
  id: coinPackage.id,
  name: coinPackage.name,
  coins: coinPackage.coins,
  priceEGP: coinPackage.priceEGP,
  currency: "EGP",
  isPopular: Boolean(coinPackage.isPopular),
});

module.exports = {
  COIN_PACKAGES,
  getCoinPackage,
  serializeCoinPackage,
};
