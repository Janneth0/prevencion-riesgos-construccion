(function () {
  'use strict';

  const L = window.Logic;
  const $ = (id) => document.getElementById(id);
  const CLAVE_REGISTRO = 'registro_inspecciones_v1';

  let DATA = null;
  let ultima = null;          // última inspección evaluada (para poder enviar la alerta)
  let registroMemoria = [];   // por si el navegador no permite localStorage

  function esc(t) {
    return String(t == null ? '' : t)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function aviso(idContenedor, texto, tipo) {
    $(idContenedor).innerHTML = texto ? '<div class="aviso ' + tipo + '">' + esc(texto) + '</div>' : '';
  }

  // -------------------------------------------------------------
  // Registro (localStorage)
  // -------------------------------------------------------------
  function leerRegistro() {
    try {
      const t = localStorage.getItem(CLAVE_REGISTRO);
      return t ? JSON.parse(t) : [];
    } catch (e) { return registroMemoria; }
  }
  function guardarRegistro(lista) {
    registroMemoria = lista;
    try { localStorage.setItem(CLAVE_REGISTRO, JSON.stringify(lista)); } catch (e) { /* sin almacenamiento */ }
  }
  function dibujarRegistro() {
    const lista = leerRegistro().slice().reverse();
    $('registro').innerHTML = lista.length
      ? lista.map(function (r) {
          return '<tr><td>' + esc(r.fecha) + '</td><td>' + esc(r.obra) + '</td><td>' + esc(r.responsable) +
            '</td><td>' + esc(r.tamano_empresa) + '</td><td>' + esc(r.riesgos.join(', ')) +
            '</td><td>' + esc(r.gravedad) + '</td><td>' + esc(r.alerta) + '</td></tr>';
        }).join('')
      : '<tr><td colspan="7" class="vacio">Todavía no hay inspecciones registradas.</td></tr>';
  }
  function actualizarAlertaRegistro(id, estado) {
    const lista = leerRegistro();
    lista.forEach(function (r) { if (r.id === id) r.alerta = estado; });
    guardarRegistro(lista);
    dibujarRegistro();
  }

  // -------------------------------------------------------------
  // Formulario
  // -------------------------------------------------------------
  function llenarSelect(id, valores, porDefecto) {
    $(id).innerHTML = valores.map(function (v) {
      return '<option value="' + esc(v) + '"' + (v === porDefecto ? ' selected' : '') + '>' + esc(v) + '</option>';
    }).join('');
  }

  function dibujarMarcos() {
    const grupos = L.agruparHechos(DATA.reglas, DATA.marcos);
    $('marcos').innerHTML = grupos.map(function (g) {
      const funcion = g.marco ? '<small>' + esc(g.marco.funcion) + '</small>' : '<small>Situaciones del entorno de trabajo</small>';
      const checks = g.hechos.map(function (h) {
        return '<label class="chk"><input type="checkbox" name="hecho" value="' + esc(h) + '"><span>' +
          esc(L.etiquetaHecho(h)) + '</span></label>';
      }).join('');
      return '<fieldset class="marco"><legend>' + esc(g.titulo) + '</legend>' + funcion + checks + '</fieldset>';
    }).join('');
  }

  function emailInspector() {
    return $('email-inspector').value.trim();
  }

  function telegramInspector() {
    return $('telegram-inspector').value.trim();
  }

  function textoDestinatarios() {
    const email = emailInspector();
    const tg = telegramInspector();
    $('destinatarios').textContent = 'La alerta se enviará por: ' +
      L.destinatarios($('tamano').value, L.emailValido(email) ? email : '', L.telegramValido(tg) ? tg : '') + '.';
  }

  function fechaHoy() {
    return new Date().toLocaleDateString('en-CA'); // AAAA-MM-DD en hora local
  }

  function limpiar() {
    document.querySelectorAll('input[name="hecho"]').forEach(function (c) { c.checked = false; });
    $('obra').value = '';
    $('responsable').value = '';
    $('email-inspector').value = '';
    $('telegram-inspector').value = '';
    textoDestinatarios();
    $('fecha').value = fechaHoy();
    $('resultados').classList.add('oculto');
    aviso('aviso-form', '', '');
    ultima = null;
  }

  // -------------------------------------------------------------
  // Evaluación: sistema experto + marcos + red neuronal
  // -------------------------------------------------------------
  function evaluar() {
    aviso('aviso-form', '', '');
    const hechos = Array.from(document.querySelectorAll('input[name="hecho"]:checked')).map(function (c) { return c.value; });
    if (!hechos.length) {
      $('resultados').classList.add('oculto');
      return aviso('aviso-form', 'Marcá al menos una condición observada en la obra.', 'error');
    }

    const email = emailInspector();
    if (email && !L.emailValido(email)) {
      $('resultados').classList.add('oculto');
      return aviso('aviso-form', 'El email del inspector no parece válido. Revisalo o dejalo vacío.', 'error');
    }

    const telegram = telegramInspector();
    if (telegram && !L.telegramValido(telegram)) {
      $('resultados').classList.add('oculto');
      return aviso('aviso-form', 'El ID de Telegram debe ser numérico (por ejemplo 123456789). Revisalo o dejalo vacío.', 'error');
    }

    const resultados = L.motorInferencia(hechos, DATA.reglas);
    if (!resultados.length) {
      $('resultados').classList.add('oculto');
      return aviso('aviso-form',
        'Con las condiciones marcadas no se activó ninguna regla (por ejemplo, las chispas solo son un riesgo si además hay material inflamable). ' +
        'Eso no garantiza que la obra sea segura: el sistema solo conoce 15 reglas.', 'info');
    }

    const op = DATA.opciones;
    const edad = Number($('edad').value);
    const anio = Number($('anio').value);
    const fila = {
      ano_notificacion: Number.isFinite(anio) && anio > 0 ? anio : op.anio_max,
      provincia: $('provincia').value,
      rama_actividad: $('rama').value,
      tamano_empresa: $('tamano-dataset').value,
      edad_trabajador: Number.isFinite(edad) && edad > 0 ? edad : op.edad_med,
      tipo_siniestro: 'Accidente De Trabajo',
      tipo_lesion: $('lesion').value
    };
    const nn = L.predecirGravedad(fila, DATA.nn);

    const lesiones = Array.from(new Set([].concat.apply([], resultados.map(function (r) { return r.lesiones_posibles; }))))
      .sort(function (a, b) { return a.localeCompare(b, 'es'); });
    const riesgos = Array.from(new Set(resultados.map(function (r) { return L.sinGuiones(r.conclusion); })));
    const tamano = $('tamano').value;
    const ahora = new Date();
    const hora = ahora.toTimeString().slice(0, 5);
    const fechaTxt = ($('fecha').value || fechaHoy()) + ' ' + hora;
    const gravedad = nn.etiqueta + ' (' + (nn.probabilidad * 100).toFixed(1) + ' %)';

    ultima = {
      payload: {
        tamano_empresa: tamano,
        hechos_detectados: hechos,
        conclusiones: resultados.map(function (r) { return r.conclusion; }),
        lesiones_posibles: lesiones,
        origen: 'Sistema experto + Red neuronal MLP',
        probabilidad_modelo: nn.probabilidad,
        gravedad_predicha: nn.etiqueta,
        obra: $('obra').value.trim(),
        responsable: $('responsable').value.trim(),
        email_inspector: email,
        telegram_id: telegram,
        fecha: fechaTxt
      },
      registroId: String(Date.now())
    };

    // Registramos la inspección
    const lista = leerRegistro();
    lista.push({
      id: ultima.registroId,
      fecha: fechaTxt,
      obra: ultima.payload.obra || '(sin nombre)',
      responsable: ultima.payload.responsable || '(sin nombre)',
      email_inspector: email,
      telegram_id: telegram,
      tamano_empresa: tamano,
      hechos: hechos.map(L.etiquetaHecho),
      riesgos: riesgos,
      lesiones: lesiones,
      gravedad: gravedad,
      alerta: 'No enviada'
    });
    guardarRegistro(lista);
    dibujarRegistro();

    // Resultados
    $('res-resumen').innerHTML =
      '<strong>' + resultados.length + ' regla(s) activada(s).</strong> Lesiones posibles (orientativo): ' +
      '<span class="chips" style="display:inline-flex;vertical-align:middle">' +
      lesiones.map(function (l) { return '<span class="chip">' + esc(l) + '</span>'; }).join('') + '</span>';

    $('res-reglas').innerHTML = resultados.map(function (r) {
      return '<tr><td>' + esc(r.regla) + '</td><td>' + esc(r.hechos.map(L.etiquetaHecho).join(' + ')) +
        '</td><td>' + esc(L.sinGuiones(r.conclusion)) + '</td><td>' + esc(r.lesiones_posibles.join(', ')) + '</td></tr>';
    }).join('');

    const marcos = L.marcosAfectados(hechos, DATA.marcos);
    $('res-marcos').innerHTML = marcos.length
      ? marcos.map(function (m) {
          return '<div class="card"><strong>' + esc(m.nombre) + '</strong>' +
            '<p class="nota">' + esc(m.funcion) + '</p>' +
            '<div><span class="nota">Riesgos asociados:</span> ' + esc(m.riesgos.map(L.sinGuiones).join(', ')) + '</div>' +
            '<div><span class="nota">Lesiones posibles:</span> ' + esc(m.lesiones_posibles.join(', ')) + '</div></div>';
        }).join('')
      : '<div class="vacio">Las condiciones marcadas corresponden al entorno general de la obra.</div>';

    $('res-gravedad').textContent = nn.etiqueta + ' · confianza del modelo ' + (nn.probabilidad * 100).toFixed(1) + ' %';
    $('res-destino').textContent = 'Empresa ' + tamano + ': la alerta se envía por ' + L.destinatarios(tamano, email, telegram) + '.';
    $('btn-enviar').textContent = 'Enviar alerta por Make';
    $('btn-enviar').disabled = false;
    aviso('aviso-envio', '', '');
    $('resultados').classList.remove('oculto');
    $('resultados').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // -------------------------------------------------------------
  // Envío de la alerta (la página llama a /api/alerta, que reenvía a Make)
  // -------------------------------------------------------------
  async function enviarAlerta() {
    if (!ultima) return;
    const btn = $('btn-enviar');
    btn.disabled = true;
    aviso('aviso-envio', 'Enviando alerta…', 'info');
    try {
      const resp = await fetch('/api/alerta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ultima.payload)
      });
      const j = await resp.json().catch(function () { return {}; });
      if (resp.ok && j.ok) {
        aviso('aviso-envio', 'Alerta enviada correctamente a Make (código ' + j.estado + ').', 'ok');
        actualizarAlertaRegistro(ultima.registroId, 'Enviada');
        btn.textContent = 'Reenviar alerta';
      } else {
        aviso('aviso-envio', 'No se pudo enviar la alerta: ' + (j.error || 'error ' + resp.status), 'error');
        actualizarAlertaRegistro(ultima.registroId, 'Error al enviar');
      }
    } catch (e) {
      aviso('aviso-envio', 'No se pudo conectar con el servidor. Revisá tu conexión e intentá de nuevo.', 'error');
    } finally {
      btn.disabled = false;
    }
  }

  function descargarCSV() {
    const csv = L.aCSV(leerRegistro());
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'registro_inspecciones.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  // -------------------------------------------------------------
  // Arranque
  // -------------------------------------------------------------
  async function iniciar() {
    try {
      const r = await fetch('modelo.json');
      if (!r.ok) throw new Error('HTTP ' + r.status);
      DATA = await r.json();
    } catch (e) {
      $('estado-carga').className = 'aviso error';
      $('estado-carga').textContent = 'No se pudo cargar modelo.json. Si abriste el archivo haciendo doble clic, probalo desde Vercel o con un servidor local.';
      return;
    }

    const op = DATA.opciones;
    llenarSelect('tamano', L.TAMANOS_ALERTA, 'chica');
    llenarSelect('provincia', op.provincias);
    llenarSelect('rama', op.ramas);
    llenarSelect('tamano-dataset', op.tamanos_dataset);
    llenarSelect('lesion', op.lesiones);
    $('edad').min = op.edad_min; $('edad').max = op.edad_max; $('edad').value = op.edad_med;
    $('anio').value = op.anio_max;
    $('fecha').value = fechaHoy();

    dibujarMarcos();
    textoDestinatarios();
    dibujarRegistro();

    $('tamano').addEventListener('change', textoDestinatarios);
    $('email-inspector').addEventListener('input', textoDestinatarios);
    $('telegram-inspector').addEventListener('input', textoDestinatarios);
    $('btn-evaluar').addEventListener('click', evaluar);
    $('btn-limpiar').addEventListener('click', limpiar);
    $('btn-enviar').addEventListener('click', enviarAlerta);
    $('btn-csv').addEventListener('click', descargarCSV);
    $('btn-borrar').addEventListener('click', function () {
      if (confirm('¿Borrar todo el registro de inspecciones de este navegador?')) {
        guardarRegistro([]);
        dibujarRegistro();
      }
    });

    $('estado-carga').classList.add('oculto');
    $('app').classList.remove('oculto');
  }

  iniciar();
})();
