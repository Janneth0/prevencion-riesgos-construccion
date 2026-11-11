// Lógica del sistema (sin DOM): sistema experto + marcos + red neuronal MLP + registro CSV.
// Se usa en el navegador (window.Logic) y también se puede probar con Node.
(function (root) {
  'use strict';

  // ---------------------------------------------------------------
  // Textos de cada condición (los "hechos" que usan las 15 reglas)
  // ---------------------------------------------------------------
  const ETIQUETAS = {
    hay_chispas: 'Hay chispas',
    hay_material_inflamable: 'Hay material inflamable',
    estructura_inestable: 'Estructura inestable',
    falta_casco: 'Falta casco',
    falta_arnes: 'Falta arnés',
    arnes_deteriorado: 'Arnés deteriorado',
    falta_botines: 'Faltan botines de seguridad',
    falta_guantes: 'Faltan guantes',
    falta_gafas: 'Faltan gafas de seguridad',
    falta_chaleco: 'Falta chaleco reflectante',
    andamio_inestable: 'Andamio inestable',
    falta_baranda: 'Falta baranda',
    plataforma_insegura: 'Plataforma insegura',
    escalera_apoyo_inseguro: 'Escalera con apoyo inseguro',
    cable_deteriorado: 'Cable deteriorado',
    herramienta_sin_proteccion: 'Herramienta sin protección'
  };

  // A qué marco (frame) pertenece cada condición
  const HECHO_A_MARCO = {
    falta_casco: 'Casco',
    falta_arnes: 'Arnés',
    arnes_deteriorado: 'Arnés',
    falta_botines: 'Botines de seguridad',
    falta_guantes: 'Guantes de seguridad',
    falta_gafas: 'Gafas de seguridad',
    falta_chaleco: 'Chaleco reflectante',
    andamio_inestable: 'Andamio',
    falta_baranda: 'Andamio',
    plataforma_insegura: 'Andamio',
    escalera_apoyo_inseguro: 'Escalera',
    cable_deteriorado: 'Herramientas eléctricas',
    herramienta_sin_proteccion: 'Herramientas eléctricas'
  };

  const TAMANOS_ALERTA = ['chica', 'mediana', 'grande', 'corporación'];

  function etiquetaHecho(h) {
    return ETIQUETAS[h] || (h.charAt(0).toUpperCase() + h.slice(1).replace(/_/g, ' '));
  }

  function sinGuiones(t) {
    return String(t).replace(/_/g, ' ');
  }

  // ---------------------------------------------------------------
  // Sistema experto
  // ---------------------------------------------------------------
  function motorInferencia(hechos, reglas) {
    const set = new Set(hechos);
    return reglas
      .filter(function (r) { return r.condicion.split(' y ').every(function (h) { return set.has(h); }); })
      .map(function (r) {
        return {
          regla: r.nombre,
          hechos: r.condicion.split(' y '),
          conclusion: r.conclusion,
          lesiones_posibles: r.lesiones_posibles
        };
      });
  }

  // Todas las condiciones que aparecen en las reglas, sin repetir y en orden
  function hechosDeReglas(reglas) {
    const lista = [];
    reglas.forEach(function (r) {
      r.condicion.split(' y ').forEach(function (h) { if (lista.indexOf(h) === -1) lista.push(h); });
    });
    return lista;
  }

  // Agrupa las condiciones por marco, para armar el formulario de inspección
  function agruparHechos(reglas, marcos) {
    const todos = hechosDeReglas(reglas);
    const grupos = marcos.map(function (m) {
      return {
        titulo: m.nombre,
        marco: m,
        hechos: todos.filter(function (h) { return HECHO_A_MARCO[h] === m.nombre; })
      };
    }).filter(function (g) { return g.hechos.length > 0; });

    const generales = todos.filter(function (h) { return !HECHO_A_MARCO[h]; });
    if (generales.length) {
      grupos.push({ titulo: 'Condiciones generales de la obra', marco: null, hechos: generales });
    }
    return grupos;
  }

  // Marcos involucrados según las condiciones detectadas
  function marcosAfectados(hechos, marcos) {
    const nombres = [];
    hechos.forEach(function (h) {
      const n = HECHO_A_MARCO[h];
      if (n && nombres.indexOf(n) === -1) nombres.push(n);
    });
    return marcos.filter(function (m) { return nombres.indexOf(m.nombre) !== -1; });
  }

  function emailValido(e) {
    const t = String(e == null ? '' : e).trim();
    return t.length <= 120 && /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[^\s@,;<>"]+$/.test(t);
  }

  // Texto de por dónde sale la alerta; si hay email, se suma el inspector a cargo
  function destinatarios(tamano, emailInspector) {
    const base = tamano === 'chica' ? 'Telegram' : 'Telegram y correo electrónico';
    return emailInspector ? base + ', y además un correo al inspector a cargo (' + emailInspector + ')' : base;
  }

  // ---------------------------------------------------------------
  // Red neuronal MLP (misma cuenta que Keras: relu, relu, sigmoid)
  // ---------------------------------------------------------------
  function vectorizar(fila, nn) {
    const x = [];
    nn.cat_cols.forEach(function (col, i) {
      const valor = String(fila[col]);
      nn.categories[i].forEach(function (cat) { x.push(String(cat) === valor ? 1 : 0); });
    });
    nn.num_cols.forEach(function (col, i) {
      x.push((Number(fila[col]) - nn.mean[i]) / nn.scale[i]);
    });
    return x;
  }

  function capaDensa(x, capa) {
    const n = capa.b.length;
    const salida = new Array(n);
    for (let j = 0; j < n; j++) {
      let s = capa.b[j];
      for (let i = 0; i < x.length; i++) s += x[i] * capa.W[i][j];
      salida[j] = capa.act === 'relu' ? Math.max(0, s) : (capa.act === 'sigmoid' ? 1 / (1 + Math.exp(-s)) : s);
    }
    return salida;
  }

  function predecirGravedad(fila, nn) {
    let x = vectorizar(fila, nn);
    nn.layers.forEach(function (capa) { x = capaDensa(x, capa); });
    const p1 = x[0];                                  // probabilidad de la clase 1
    const idx = p1 >= 0.5 ? 1 : 0;
    return {
      p1: p1,
      etiqueta: nn.classes[idx],                      // 0 = "Gravedad mayor", 1 = "Gravedad menor"
      probabilidad: idx === 1 ? p1 : 1 - p1
    };
  }

  // ---------------------------------------------------------------
  // Registro de inspecciones -> CSV (con BOM para que Excel lea bien las tildes)
  // ---------------------------------------------------------------
  function aCSV(registros) {
    const cols = [
      ['fecha', 'Fecha'], ['obra', 'Obra'], ['responsable', 'Responsable'], ['email_inspector', 'Email del inspector'],
      ['tamano_empresa', 'Tamaño de empresa'], ['hechos', 'Condiciones detectadas'],
      ['riesgos', 'Riesgos'], ['lesiones', 'Lesiones posibles'],
      ['gravedad', 'Gravedad estimada'], ['alerta', 'Alerta']
    ];
    function celda(v) {
      let t = Array.isArray(v) ? v.join('; ') : String(v == null ? '' : v);
      if (/^[=+\-@]/.test(t)) t = "'" + t;            // evita fórmulas al abrir en Excel
      return '"' + t.replace(/"/g, '""') + '"';
    }
    const lineas = [cols.map(function (c) { return celda(c[1]); }).join(',')];
    registros.forEach(function (r) {
      lineas.push(cols.map(function (c) { return celda(r[c[0]]); }).join(','));
    });
    return '\uFEFF' + lineas.join('\r\n');
  }

  const API = {
    ETIQUETAS: ETIQUETAS, HECHO_A_MARCO: HECHO_A_MARCO, TAMANOS_ALERTA: TAMANOS_ALERTA,
    etiquetaHecho: etiquetaHecho, sinGuiones: sinGuiones,
    motorInferencia: motorInferencia, hechosDeReglas: hechosDeReglas,
    agruparHechos: agruparHechos, marcosAfectados: marcosAfectados, destinatarios: destinatarios, emailValido: emailValido,
    vectorizar: vectorizar, predecirGravedad: predecirGravedad, aCSV: aCSV
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.Logic = API;
})(typeof window !== 'undefined' ? window : this);
