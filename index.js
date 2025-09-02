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

/**
 * Observa cambios internos de un elemento (hijos, texto y/o atributos).
 * @param {Element} element - Elemento a observar.
 * @param {(info: {
 *   element: Element,
 *   mutations: MutationRecord[],
 *   summary: { added: Element[], removed: Element[], textChanged: number, attributesChanged: Record<string, number> }
 * }) => void} cb - Callback al detectar cambios.
 * @param {Object} [options]
 * @param {boolean} [options.childList=true] - Detectar nodos hijos añadidos/quitados.
 * @param {boolean} [options.characterData=true] - Detectar cambios en texto.
 * @param {boolean} [options.attributes=false] - Detectar cambios de atributos.
 * @param {string[]} [options.attributeFilter] - Filtrar atributos específicos (ej. ['class','style']).
 * @param {boolean} [options.subtree=true] - Incluir todo el subárbol (contenido interno).
 * @param {number} [options.debounce=0] - Agrupar cambios en una ventana (ms).
 * @param {boolean} [options.once=false] - Dejar de observar después del primer disparo.
 * @returns {() => void} Función para dejar de observar.
 */
export function onElementContentChange(element, cb, options = {}) {
  if (!(element instanceof Element)) {
    throw new Error("onElementContentChange: 'element' debe ser un Element del DOM");
  }

  const {
    childList = true,
    characterData = true,
    attributes = false,
    attributeFilter,
    subtree = true,
    debounce = 0,
    once = false
  } = options;

  let timer = null;
  let queue = [];

  const observer = new MutationObserver((mutations) => {
    queue.push(...mutations);
    if (debounce > 0) {
      clearTimeout(timer);
      timer = setTimeout(flush, debounce);
    } else {
      flush();
    }
  });

  function summarizeMutations(muts) {
    const summary = {
      added: [],
      removed: [],
      textChanged: 0,
      attributesChanged: {}
    };

    for (const m of muts) {
      if (m.type === "childList") {
        for (const n of m.addedNodes) if (n.nodeType === 1) summary.added.push(n);
        for (const n of m.removedNodes) if (n.nodeType === 1) summary.removed.push(n);
      } else if (m.type === "characterData") {
        summary.textChanged++;
      } else if (m.type === "attributes") {
        const name = m.attributeName || "_";
        summary.attributesChanged[name] = (summary.attributesChanged[name] || 0) + 1;
      }
    }
    return summary;
  }

  function flush() {
    if (queue.length === 0) return;
    const batch = queue;
    queue = [];
    cb({ element, mutations: batch, summary: summarizeMutations(batch) });
    if (once) observer.disconnect();
  }

  observer.observe(element, {
    childList,
    characterData,
    attributes,
    attributeFilter,
    subtree
  });

  return () => observer.disconnect();
}
