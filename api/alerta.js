// Función serverless de Vercel: recibe la alerta desde la interfaz y la reenvía
// al webhook de Make. El link de Make vive en una variable de entorno (WEBHOOK_URL),
// así nunca queda a la vista en el código ni en GitHub.

const TAMANOS = ['chica', 'mediana', 'grande', 'corporación'];

function lista(v, max) {
  if (!Array.isArray(v) || v.length > max) return null;
  return v.map((x) => String(x).slice(0, 200));
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Método no permitido' });
  }

  const url = process.env.WEBHOOK_URL;
  if (!url) {
    return res.status(500).json({ ok: false, error: 'Falta configurar WEBHOOK_URL en Vercel' });
  }

  const b = req.body;
  if (!b || typeof b !== 'object') {
    return res.status(400).json({ ok: false, error: 'Cuerpo inválido' });
  }

  const hechos = lista(b.hechos_detectados, 30);
  const conclusiones = lista(b.conclusiones, 30);
  const lesiones = lista(b.lesiones_posibles, 30);
  const probabilidad = Number(b.probabilidad_modelo);

  if (!TAMANOS.includes(b.tamano_empresa) || !hechos || !conclusiones || !lesiones || !hechos.length) {
    return res.status(400).json({ ok: false, error: 'Datos de la alerta inválidos' });
  }

  // Mismo formato que el notebook (+ obra, responsable y fecha, por si querés usarlos en Make)
  const datos = {
    tamano_empresa: b.tamano_empresa,
    hechos_detectados: hechos,
    conclusiones: conclusiones,
    lesiones_posibles: lesiones,
    origen: 'Sistema experto + Red neuronal MLP',
    probabilidad_modelo: Number.isFinite(probabilidad) ? probabilidad : null,
    gravedad_predicha: String(b.gravedad_predicha || '').slice(0, 50),
    obra: String(b.obra || '').slice(0, 120),
    responsable: String(b.responsable || '').slice(0, 120),
    fecha: String(b.fecha || '').slice(0, 40)
  };

  const control = new AbortController();
  const timer = setTimeout(() => control.abort(), 10000);

  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(datos),
      signal: control.signal
    });
    if (!r.ok) {
      return res.status(502).json({ ok: false, error: 'Make respondió con el código ' + r.status });
    }
    return res.status(200).json({ ok: true, estado: r.status });
  } catch (e) {
    return res.status(502).json({ ok: false, error: 'No se pudo contactar a Make' });
  } finally {
    clearTimeout(timer);
  }
};
