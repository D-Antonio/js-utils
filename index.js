export const cssStringToObject = (cssString) => cssString
    .split(";")
    .filter(p => p.trim().length > 0)
    .reduce((e, r) => {
        const [k, v] = r.split(":").map(p => p.trim());
        e[k] = v;
        return e;
    }, {})


export function getElementCSS(element) {
    const result = {};
    const classList = element.classList;

    for (const cls of classList) {
        const selector = `.${cls}`;
        for (const sheet of document.styleSheets) {
            try {
                for (const regla of sheet.cssRules) {
                    if (regla.selectorText === selector) {
                        Object.assign(result, cssStringToObject(regla.style.cssText));
                    }
                }
            } catch (err) {
                // Algunos stylesheets no son accesibles por CORS
            }
        }
    }
    return result;
}
