// Node module customization hooks: redirect `mysql2/promise` to the validating mock.
export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'mysql2/promise') {
    return {
      shortCircuit: true,
      url: new URL('./mock-mysql.mjs', import.meta.url).href,
    };
  }
  return nextResolve(specifier, context);
}
