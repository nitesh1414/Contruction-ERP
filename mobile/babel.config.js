module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // Force-lower class private elements (#field / #method() / #x in obj).
      // RN 0.81 source ships them, and mismatching babel-preset-expo / Hermes
      // assumes engine support — Expo Go's stable Hermes then fails with:
      //   "SyntaxError: ...private properties are not supported"
      // These explicit transforms make the emitted bundle Hermes-safe no matter
      // what preset variant happens to be installed on the dev machine.
      '@babel/plugin-transform-class-properties',
      '@babel/plugin-transform-private-methods',
      '@babel/plugin-transform-private-property-in-object',
    ],
  };
};
