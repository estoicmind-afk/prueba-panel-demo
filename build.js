// Arma la página completa a partir de content/ y media/. Sin WordPress, sin plugins.
// Uso: node build.js  → genera _site/
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const ROOT = __dirname;
const OUT = path.join(ROOT, "_site");
const SITE_URL = (process.env.SITE_URL || "https://ejemplo.com").replace(/\/$/, "");
// Solo para la prueba en GitHub Pages, que sirve la página dentro de una subcarpeta.
const BASE = (process.env.BASE_PATH || "").replace(/\/$/, "");

const readJSON = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), "utf8"));
const readDir = (dir) =>
  fs.readdirSync(path.join(ROOT, dir))
    .filter((f) => f.endsWith(".json"))
    .map((f) => ({ slug: f.replace(/\.json$/, ""), ...readJSON(path.join(dir, f)) }));

const esc = (s = "") => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const slugify = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const sitio = readJSON("content/sitio.json");
const inicio = readJSON("content/inicio.json");
const productos = readDir("content/productos").filter((p) => p.publicado !== false).sort((a, b) => (a.orden ?? 50) - (b.orden ?? 50) || a.nombre.localeCompare(b.nombre));
const proyectos = readDir("content/proyectos").filter((p) => p.publicado !== false).sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
const categorias = [...new Set(productos.map((p) => p.categoria))];

// ---------- Imágenes: se achican solas, suba el equipo lo que suba ----------
const imgCache = new Map();
async function img(src, width = 1200) {
  if (!src) return "";
  const key = src + "@" + width;
  if (imgCache.has(key)) return imgCache.get(key);
  const file = path.join(ROOT, src.replace(/^\//, ""));
  const name = path.basename(src).replace(/\.[^.]+$/, "") + "-" + width + ".webp";
  const outRel = "/img/" + name;
  fs.mkdirSync(path.join(OUT, "img"), { recursive: true });
  await sharp(file).rotate().resize({ width, withoutEnlargement: true }).webp({ quality: 74 }).toFile(path.join(OUT, outRel));
  imgCache.set(key, outRel);
  return outRel;
}

// ---------- Plantilla común ----------
const wa = (texto) => `https://wa.me/${sitio.whatsapp}?text=${encodeURIComponent(texto)}`;
function page({ title, description, body, canonical, jsonld = [] }) {
  return `<!doctype html>
<html lang="es"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="robots" content="noindex">
<link rel="canonical" href="${SITE_URL}${canonical}">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}">
<link rel="stylesheet" href="/assets/estilo.css">
${jsonld.map((j) => `<script type="application/ld+json">${JSON.stringify(j)}</script>`).join("\n")}
</head><body>
<header class="top"><a class="marca" href="/">${esc(sitio.empresa)}</a>
<nav><a href="/catalogo/">Catálogo</a><a href="/proyectos/">Proyectos</a><a href="/contacto/">Contacto</a></nav></header>
<main>${body}</main>
<footer class="pie"><p>${esc(sitio.empresa)} · ${sitio.anios} años de operación</p>
<p>${sitio.sedes.map((s) => esc(s.ciudad)).join(" · ")} · ${esc(sitio.telefono)}</p></footer>
<a class="wa-flotante" href="${wa("Hola, vengo de la página web.")}">WhatsApp</a>
</body></html>`;
}
function write(rel, html) {
  const file = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (BASE && rel.endsWith(".html")) html = html.replace(/(href|src)="\//g, `$1="${BASE}/`).replace(/url\('\//g, `url('${BASE}/`);
  fs.writeFileSync(file, html);
}
const org = { "@context": "https://schema.org", "@type": "Organization", name: sitio.empresa, url: SITE_URL, telephone: sitio.telefono,
  address: sitio.sedes.map((s) => ({ "@type": "PostalAddress", addressLocality: s.ciudad, streetAddress: s.direccion, addressCountry: "PA" })) };

async function tarjeta(p) {
  return `<a class="tarjeta" href="/catalogo/${p.slug}/"><img src="${await img(p.imagen, 640)}" alt="${esc(p.nombre)}" loading="lazy" width="640">
<span class="cat">${esc(p.categoria)}</span><strong>${esc(p.nombre)}</strong><span>${esc(p.resumen)}</span></a>`;
}

(async () => {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  fs.cpSync(path.join(ROOT, "assets"), path.join(OUT, "assets"), { recursive: true });

  // Portada
  const destacados = productos.filter((p) => p.destacado);
  write("index.html", page({
    title: `${sitio.empresa} · ${sitio.eslogan}`, description: inicio.subtitulo, canonical: "/", jsonld: [org],
    body: `<section class="hero" style="background-image:url('${await img(inicio.foto_principal, 1600)}')"><div>
<p class="sobre">Desde hace ${sitio.anios} años</p><h1>${esc(inicio.titular)}</h1><p>${esc(inicio.subtitulo)}</p>
<a class="btn" href="/catalogo/">Ver el catálogo</a></div></section>
<section class="areas">${inicio.areas.map((a) => `<a href="/catalogo/#${slugify(a.categoria || "")}"><h2>${esc(a.titulo)}</h2><p>${esc(a.texto)}</p></a>`).join("")}</section>
<section class="bloque"><h2>Equipos destacados</h2><div class="rejilla">${(await Promise.all(destacados.map(tarjeta))).join("")}</div></section>`,
  }));

  // Catálogo por categoría
  let cat = `<section class="bloque"><h1>Catálogo</h1><p>Todos los equipos se cotizan por WhatsApp.</p>`;
  for (const c of categorias) {
    const items = productos.filter((p) => p.categoria === c);
    cat += `<h2 id="${slugify(c)}">${esc(c)}</h2><div class="rejilla">${(await Promise.all(items.map(tarjeta))).join("")}</div>`;
  }
  write("catalogo/index.html", page({ title: `Catálogo · ${sitio.empresa}`, description: "Catálogo de equipos geoespaciales.", canonical: "/catalogo/", body: cat + "</section>" }));

  // Ficha de cada producto
  for (const p of productos) {
    const foto = await img(p.imagen, 1200);
    const specs = (p.especificaciones || []).filter((s) => s.dato);
    write(`catalogo/${p.slug}/index.html`, page({
      title: `${p.nombre} · ${sitio.empresa}`, description: p.resumen, canonical: `/catalogo/${p.slug}/`,
      jsonld: [{ "@context": "https://schema.org", "@type": "Product", name: p.nombre, description: p.resumen, image: SITE_URL + foto, category: p.categoria, brand: { "@type": "Organization", name: sitio.empresa } }],
      body: `<article class="ficha"><img src="${foto}" alt="${esc(p.nombre)}" width="1200">
<div><p class="cat">${esc(p.categoria)}</p><h1>${esc(p.nombre)}</h1><p class="resumen">${esc(p.resumen)}</p>
<a class="btn" href="${wa(`Hola, quiero cotizar: ${p.nombre}`)}">Cotizar por WhatsApp</a>
<div class="texto">${p.descripcion || ""}</div>
${specs.length ? `<table>${specs.map((s) => `<tr><th>${esc(s.dato)}</th><td>${esc(s.valor)}</td></tr>`).join("")}</table>` : ""}</div></article>`,
    }));
  }

  // Proyectos
  write("proyectos/index.html", page({
    title: `Proyectos · ${sitio.empresa}`, description: "Proyectos y servicios realizados.", canonical: "/proyectos/",
    body: `<section class="bloque"><h1>Proyectos realizados</h1><div class="rejilla">${(await Promise.all(proyectos.map(async (p) =>
      `<div class="tarjeta"><img src="${await img(p.imagen, 640)}" alt="${esc(p.titulo)}" loading="lazy" width="640"><span class="cat">${esc(p.sector)}</span><strong>${esc(p.titulo)}</strong><span>${esc(p.resumen)}</span></div>`))).join("")}</div></section>`,
  }));

  // Contacto
  write("contacto/index.html", page({
    title: `Contacto · ${sitio.empresa}`, description: "Sedes y contacto.", canonical: "/contacto/", jsonld: [org],
    body: `<section class="bloque"><h1>Contacto</h1><a class="btn" href="${wa("Hola, quiero información.")}">Escribir por WhatsApp</a>
<p>${esc(sitio.telefono)} · ${esc(sitio.correo)}</p>${sitio.sedes.map((s) => `<h2>${esc(s.ciudad)}</h2><p>${esc(s.direccion)}</p>`).join("")}</section>`,
  }));

  // Google: sitemap y robots
  const urls = ["/", "/catalogo/", "/proyectos/", "/contacto/", ...productos.map((p) => `/catalogo/${p.slug}/`)];
  write("sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `<url><loc>${SITE_URL}${u}</loc></url>`).join("\n")}\n</urlset>\n`);
  write("robots.txt", `User-agent: *\nAllow: /\nSitemap: ${SITE_URL}/sitemap.xml\n`);

  // Direcciones viejas → nuevas (para no perder lo que Google ya conoce)
  const redirs = readDir("content/productos").filter((p) => p.url_anterior).map((p) => `${p.url_anterior} /catalogo/${p.slug}/ 301`);
  redirs.push("/product/* /catalogo/ 301", "/product-category/* /catalogo/ 301", "/shop/* /catalogo/ 301");
  write("_redirects", redirs.join("\n") + "\n");

  console.log(`Listo: ${productos.length} productos, ${proyectos.length} proyectos, ${urls.length} páginas, ${redirs.length} redirecciones.`);
})().catch((e) => { console.error(e); process.exit(1); });
