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

/**
 * Detecta cuando un elemento es removido/reemplazado del DOM.
 * @param {Element} element - El elemento a vigilar.
 * @param {(info: { oldEl: Element, newEl: Element|null, parent: Node|null, mutation: MutationRecord }) => void} cb
 * @returns {() => void} función para desuscribirse
 */
export function onElementReplaced(element, cb) {
  if (!(element instanceof Element)) {
    throw new Error("onElementReplaced: 'element' debe ser un Element del DOM");
  }

  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type !== "childList") continue;

      // ¿Quitaron exactamente este nodo (o lo contenían)?
      let fueQuitado = false;
      for (const removed of m.removedNodes) {
        if (removed === element || (removed.contains?.(element))) {
          fueQuitado = true;
          break;
        }
      }
      if (!fueQuitado) continue;

      // Heurística: si es un "replace", suele venir acompañado de un addedNode en el mismo record
      // y con el mismo parent (m.target).
      let newEl = null;
      if (m.addedNodes && m.addedNodes.length) {
        // Caso más común: 1 agregado = el reemplazo
        if (m.addedNodes.length === 1) {
          newEl = m.addedNodes[0] instanceof Element ? m.addedNodes[0] : null;
        } else {
          // Si agregaron varios, probamos tomar el que quede en la misma posición aproximada
          // (esto es heurístico; ajusta si necesitas más precisión)
          const addedEls = [...m.addedNodes].filter(n => n.nodeType === 1);
          newEl = addedEls[addedEls.length - 1] || null;
        }
      }

      cb({ oldEl: element, newEl, parent: m.target || null, mutation: m });

      // Si solo quieres disparar una vez:
      observer.disconnect();
      return;
    }
  });

  // Observamos todo el documento para no perdernos cambios del padre
  observer.observe(document.documentElement || document, {
    childList: true,
    subtree: true
  });

  // Si ya no está conectado al iniciar, dispara de una vez
  if (!element.isConnected) {
    queueMicrotask(() => {
      cb({ oldEl: element, newEl: null, parent: null, mutation: null });
      observer.disconnect();
    });
  }

  // retorna un "off"
  return () => observer.disconnect();
}
