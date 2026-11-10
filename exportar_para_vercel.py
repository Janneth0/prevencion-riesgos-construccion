# =====================================================================
# EXPORTAR EL SISTEMA PARA LA INTERFAZ WEB (ejecutar en Colab, al final
# del notebook, después de haber corrido TODAS las celdas anteriores)
# Genera un único archivo: modelo.json
# =====================================================================
import json
import numpy as np
import tensorflow as tf
from google.colab import files

# 1) Red neuronal: pesos de las capas Dense
capas = [l for l in modelo.layers if isinstance(l, tf.keras.layers.Dense)]
layers = []
for l in capas:
    W, b = l.get_weights()
    layers.append({"act": l.activation.__name__,
                   "W": np.round(W, 7).tolist(),
                   "b": np.round(b, 7).tolist()})

# 2) Preprocesador: categorías del OneHotEncoder y media/desvío del StandardScaler
t = {nombre: (tr, cols) for nombre, tr, cols in preprocesador.transformers_}
enc, cat_cols = t["cat"]
esc, num_cols = t["num"]

nn = {
    "cat_cols": list(cat_cols),
    "categories": [[str(c) for c in cats] for cats in enc.categories_],
    "num_cols": list(num_cols),
    "mean": [float(m) for m in esc.mean_],
    "scale": [float(s) for s in esc.scale_],
    "layers": layers,
    "classes": [str(c) for c in codificador.classes_],   # 0 = mayor, 1 = menor
}

# 3) Opciones de los desplegables (salen del dataset)
def valores(col):
    return sorted(df_modelo[col].dropna().astype(str).unique().tolist())

opciones = {
    "provincias": valores("provincia"),
    "ramas": valores("rama_actividad"),
    "tamanos_dataset": valores("tamano_empresa"),
    "lesiones": valores("tipo_lesion"),
    "edad_min": int(df_modelo["edad_trabajador"].min()),
    "edad_max": int(df_modelo["edad_trabajador"].max()),
    "edad_med": int(df_modelo["edad_trabajador"].median()),
    "anio_max": int(df_modelo["ano_notificacion"].max()),
}

# 4) Verificación: que la versión exportada dé lo mismo que Keras + scikit-learn
muestra = df_modelo.dropna(subset=columnas_modelo).head(200)

def vectorizar(fila):
    x = []
    for col, cats in zip(nn["cat_cols"], nn["categories"]):
        x += [1.0 if str(fila[col]) == c else 0.0 for c in cats]
    for col, m, s in zip(nn["num_cols"], nn["mean"], nn["scale"]):
        x.append((float(fila[col]) - m) / s)
    return x

def predecir(x):
    x = np.array(x)
    for capa in layers:
        z = x @ np.array(capa["W"]) + np.array(capa["b"])
        x = np.maximum(0, z) if capa["act"] == "relu" else 1 / (1 + np.exp(-z))
    return float(x[0])

X_manual = np.array([vectorizar(f) for _, f in muestra.iterrows()])
X_sklearn = preprocesador.transform(muestra[columnas_modelo])
assert np.allclose(X_manual, X_sklearn, atol=1e-6), "El preprocesamiento exportado NO coincide"

p_manual = np.array([predecir(x) for x in X_manual])
p_keras = modelo.predict(X_sklearn, verbose=0).ravel()
assert np.allclose(p_manual, p_keras, atol=1e-4), "Las predicciones exportadas NO coinciden"
print("✅ Verificación correcta: la exportación coincide con Keras y scikit-learn")

# 5) Guardamos y descargamos
datos = {"marcos": marcos, "reglas": reglas, "opciones": opciones, "nn": nn}
with open("modelo.json", "w", encoding="utf-8") as f:
    json.dump(datos, f, ensure_ascii=False)

print("Clases:", nn["classes"])
files.download("modelo.json")
