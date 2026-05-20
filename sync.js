// sync.js - Synchronisation Shopify → Webflow CMS
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';

// ========================================
// 🔐 CONFIGURATION
// ========================================
const SHOPIFY_STORE  = process.env.SHOPIFY_DOMAIN;
const SHOPIFY_TOKEN  = process.env.SHOPIFY_TOKEN;
const WEBFLOW_TOKEN  = process.env.WEBFLOW_TOKEN;
const WEBFLOW_COLLECTION_ID            = process.env.WEBFLOW_COLLECTION_ID;
const WEBFLOW_CATEGORIES_COLLECTION_ID = process.env.WEBFLOW_CATEGORIES_COLLECTION_ID;
const GITHUB_TOKEN   = process.env.GITHUB_TOKEN;
const GITHUB_REPO    = 'fbossuet/biscotti-sync';
const WEBFLOW_SITE_ID = '684eedc225e45d423c74aa02';
const STATE_FILE     = path.join(process.cwd(), 'sync-state.json');

// ========================================
// 🎯 ENVIRONNEMENT (staging | production)
// ========================================
const ENV = process.argv[2] || 'staging';
if (!['staging', 'production'].includes(ENV)) {
  console.error('❌ Argument invalide. Utilise: node sync.js staging | production');
  process.exit(1);
}

// ========================================
// 📂 GESTION DU STATE
// ========================================
function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    }
  } catch (e) {}
  return {};
}

function saveStateLocally(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

async function pushFileToGitHub(filename, content) {
  if (!GITHUB_TOKEN) {
    console.log(`⚠️  GITHUB_TOKEN absent — ${filename} non sauvegardé\n`);
    return;
  }

  const getRes = await fetch(
    `https://api.github.com/repos/${GITHUB_REPO}/contents/${filename}`,
    { headers: { 'Authorization': `token ${GITHUB_TOKEN}`, 'accept': 'application/vnd.github.v3+json' } }
  );

  let sha = null;
  if (getRes.ok) {
    const data = await getRes.json();
    sha = data.sha;
  }

  const encoded = Buffer.from(content).toString('base64');
  const body = {
    message: `chore: update ${filename} [skip ci]`,
    content: encoded,
    ...(sha ? { sha } : {})
  };

  const putRes = await fetch(
    `https://api.github.com/repos/${GITHUB_REPO}/contents/${filename}`,
    {
      method: 'PUT',
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'Content-Type': 'application/json',
        'accept': 'application/vnd.github.v3+json'
      },
      body: JSON.stringify(body)
    }
  );

  if (putRes.ok) {
    console.log(`💾 ${filename} sauvegardé sur GitHub\n`);
  } else {
    const err = await putRes.json();
    console.log(`⚠️  Erreur sauvegarde ${filename}: ${JSON.stringify(err)}\n`);
  }
}

// ========================================
// 🧹 NETTOYER LES METAFIELDS
// ========================================
function cleanMetafieldValue(value) {
  if (!value) return '';
  if (typeof value === 'string' && value.trim().startsWith('{')) {
    try { const p = JSON.parse(value); if (p.url) return p.url; } catch (e) {}
  }
  if (typeof value === 'string' && value.trim().startsWith('[')) {
    try { const p = JSON.parse(value); if (Array.isArray(p) && p.length > 0) return p[0].toString(); } catch (e) {}
  }
  if (typeof value === 'string') return value.replace(/^["']|["']$/g, '');
  if (value && typeof value === 'object' && 'value' in value) return cleanMetafieldValue(value.value);
  return '';
}

function cleanHtml(html) {
  if (!html) return '';
  return html
    .replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n\n').replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&quot;/g, '"').trim();
}

// ========================================
// 📦 RÉCUPÉRER LES PRODUITS SHOPIFY
// ========================================
async function fetchShopifyProducts() {
  console.log('🛒 Récupération des produits Shopify...\n');

  const query = `
    query {
      products(first: 250) {
        edges {
          node {
            id title handle description updatedAt
            featuredImage { url }
            tags
            variants(first: 1) { edges { node { price } } }
            metafields(first: 20) { edges { node { namespace key value } } }
          }
        }
      }
    }
  `;

  const response = await fetch(
    `https://${SHOPIFY_STORE}/admin/api/2024-01/graphql.json`,
    { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': SHOPIFY_TOKEN }, body: JSON.stringify({ query }) }
  );

  if (!response.ok) throw new Error(`Erreur Shopify ${response.status}: ${await response.text()}`);
  const data = await response.json();
  if (data.errors) throw new Error(`Erreur GraphQL: ${JSON.stringify(data.errors)}`);

  const products = data.data.products.edges.map(edge => {
    const product = edge.node;
    const metafields = {};
    product.metafields.edges.forEach(({ node }) => {
      const key = node.key.replace(/-/g, '_');
      const camelKey = key.replace(/_([a-z])/g, (_, l) => l.toUpperCase());
      metafields[camelKey] = cleanMetafieldValue(node.value);
    });

    const tagsArray  = product.tags || [];
    const isCategorie = tagsArray.includes('categorie');
    const tagProduits = tagsArray.filter(t => t !== 'categorie').join(', ');

    return {
      id:          product.id.replace('gid://shopify/Product/', ''),
      title:       product.title,
      handle:      product.handle,
      description: product.description || '',
      price:       product.variants.edges[0]?.node.price || '0',
      image:       product.featuredImage?.url || null,
      tags:        tagsArray.join(', '),
      tagProduits,
      isCategorie,
      updatedAt:   product.updatedAt,
      metafields: {
        produitDuMoment:         metafields.produitDuMoment         || 'false',
        encartVert:              metafields.encartVert              || '',
        dateDisponibilite:       metafields.dateDisponibilite       || '',
        lienversClickAndCollect: metafields.lienversClickAndCollect || '',
        ordreDAffichage:         metafields.ordreDAffichage         || ''
      }
    };
  });

  const categories = products.filter(p => p.isCategorie);
  const produits   = products.filter(p => !p.isCategorie);
  console.log(`✅ ${products.length} produits récupérés (${produits.length} produits + ${categories.length} catégories)\n`);
  return { produits, categories };
}

// ========================================
// 📋 RÉCUPÉRER LES ITEMS D'UNE COLLECTION
// ========================================
async function fetchWebflowItems(collectionId) {
  console.log(`📋 Récupération des items Webflow (collection: ${collectionId})...\n`);
  const items = [];
  let offset = 0;

  while (true) {
    const response = await fetch(
      `https://api.webflow.com/v2/collections/${collectionId}/items?limit=100&offset=${offset}`,
      { headers: { 'Authorization': `Bearer ${WEBFLOW_TOKEN}`, 'accept': 'application/json' } }
    );
    if (!response.ok) throw new Error(`Erreur ${response.status}: ${await response.text()}`);
    const data = await response.json();
    const validItems = data.items.filter(item => item.fieldData?.['shopify-product-id'] && item.id);
    items.push(...validItems);
    console.log(`   📦 ${items.length} items chargés...`);
    if (!data.items || data.items.length < 100) break;
    offset += 100;
    await new Promise(r => setTimeout(r, 200));
  }

  console.log(`✅ Total: ${items.length} items\n`);
  return items;
}

// ========================================
// 🧹 NETTOYER LES DOUBLONS
// ========================================
async function cleanDuplicates(items, collectionId) {
  console.log('🧹 Vérification des doublons...\n');
  const grouped = new Map();
  items.forEach(item => {
    const id = item.fieldData['shopify-product-id'];
    if (!id) return;
    if (!grouped.has(id)) grouped.set(id, []);
    grouped.get(id).push(item);
  });

  let deleted = 0;
  const toKeep = new Map();
  for (const [shopifyId, duplicates] of grouped) {
    toKeep.set(shopifyId, duplicates[0].id);
    if (duplicates.length > 1) {
      for (let i = 1; i < duplicates.length; i++) {
        try {
          await fetch(`https://api.webflow.com/v2/collections/${collectionId}/items/${duplicates[i].id}`,
            { method: 'DELETE', headers: { 'Authorization': `Bearer ${WEBFLOW_TOKEN}` } });
          deleted++;
          await new Promise(r => setTimeout(r, 500));
        } catch (e) {}
      }
    }
  }

  if (deleted > 0) console.log(`✅ ${deleted} doublons supprimés\n`);
  else             console.log(`✅ Aucun doublon\n`);
  return toKeep;
}

// ========================================
// ➕ PRODUITS — build / create / update
// ========================================
function buildProductFieldData(product) {
  const data = {
    fieldData: {
      'name': product.title, 'slug': product.handle,
      'description': cleanHtml(product.description), 'prix': product.price,
      'shopify-product-id': product.id, 'shopify-handle': product.handle, 'balise': product.tags,
      'produit-du-moment': product.metafields.produitDuMoment === 'true',
      'encart-vert': product.metafields.encartVert,
      'date-disponibilite': product.metafields.dateDisponibilite,
      'lien-vers-click-and-collect': product.metafields.lienversClickAndCollect,
      'ordre-d-affichage-5': product.metafields.ordreDAffichage
    }
  };
  if (product.image) data.fieldData['image-principale'] = { url: product.image };
  return data;
}

async function createWebflowItem(product) {
  const r = await fetch(`https://api.webflow.com/v2/collections/${WEBFLOW_COLLECTION_ID}/items`,
    { method: 'POST', headers: { 'Authorization': `Bearer ${WEBFLOW_TOKEN}`, 'Content-Type': 'application/json', 'accept': 'application/json' }, body: JSON.stringify(buildProductFieldData(product)) });
  if (!r.ok) throw new Error(`Erreur ${r.status}: ${JSON.stringify(await r.json())}`);
  return await r.json();
}

async function updateWebflowItem(itemId, product) {
  if (!itemId || itemId === 'undefined') throw new Error('ID Webflow invalide');
  const r = await fetch(`https://api.webflow.com/v2/collections/${WEBFLOW_COLLECTION_ID}/items/${itemId}`,
    { method: 'PATCH', headers: { 'Authorization': `Bearer ${WEBFLOW_TOKEN}`, 'Content-Type': 'application/json', 'accept': 'application/json' }, body: JSON.stringify(buildProductFieldData(product)) });
  if (!r.ok) throw new Error(`Erreur ${r.status}: ${JSON.stringify(await r.json())}`);
  return await r.json();
}

// ========================================
// ➕ CATÉGORIES — build / create / update
// ========================================
function buildCategoryFieldData(product) {
  const ordre = product.metafields.ordreDAffichage ? parseInt(product.metafields.ordreDAffichage, 10) || null : null;
  const data = {
    fieldData: {
      'name': product.title, 'slug': product.handle,
      'description-de-la-categorie': cleanHtml(product.description),
      'shopify-product-id': product.id,
      'tag-produits-2': product.tagProduits,
      'lien-commander-2': product.metafields.lienversClickAndCollect,
      'affichage-sur-page-d-accueil': product.metafields.produitDuMoment === 'true',
      'ordre-d-affichage': ordre
    }
  };
  if (product.image) data.fieldData['image-de-la-categorie'] = { url: product.image };
  return data;
}

async function createWebflowCategory(product) {
  const r = await fetch(`https://api.webflow.com/v2/collections/${WEBFLOW_CATEGORIES_COLLECTION_ID}/items`,
    { method: 'POST', headers: { 'Authorization': `Bearer ${WEBFLOW_TOKEN}`, 'Content-Type': 'application/json', 'accept': 'application/json' }, body: JSON.stringify(buildCategoryFieldData(product)) });
  if (!r.ok) throw new Error(`Erreur ${r.status}: ${JSON.stringify(await r.json())}`);
  return await r.json();
}

async function updateWebflowCategory(itemId, product) {
  if (!itemId || itemId === 'undefined') throw new Error('ID Webflow invalide');
  const r = await fetch(`https://api.webflow.com/v2/collections/${WEBFLOW_CATEGORIES_COLLECTION_ID}/items/${itemId}`,
    { method: 'PATCH', headers: { 'Authorization': `Bearer ${WEBFLOW_TOKEN}`, 'Content-Type': 'application/json', 'accept': 'application/json' }, body: JSON.stringify(buildCategoryFieldData(product)) });
  if (!r.ok) throw new Error(`Erreur ${r.status}: ${JSON.stringify(await r.json())}`);
  return await r.json();
}

// ========================================
// 📢 PUBLIER UN ITEM
// ========================================
async function publishWebflowItem(itemId, collectionId) {
  const r = await fetch(`https://api.webflow.com/v2/collections/${collectionId}/items/publish`,
    { method: 'POST', headers: { 'Authorization': `Bearer ${WEBFLOW_TOKEN}`, 'Content-Type': 'application/json', 'accept': 'application/json' }, body: JSON.stringify({ itemIds: [itemId] }) });
  if (!r.ok) throw new Error(`Erreur publication ${r.status}: ${JSON.stringify(await r.json())}`);
  return await r.json();
}

// ========================================
// 🌐 PUBLIER LE SITE
// ========================================
async function publishSite() {
  console.log('\n🌐 Publication du site en production...\n');
  const r = await fetch(`https://api.webflow.com/v2/sites/${WEBFLOW_SITE_ID}/publish`,
    { method: 'POST', headers: { 'Authorization': `Bearer ${WEBFLOW_TOKEN}`, 'Content-Type': 'application/json', 'accept': 'application/json' }, body: JSON.stringify({}) });
  if (!r.ok) throw new Error(`Erreur publication site ${r.status}: ${JSON.stringify(await r.json())}`);
  console.log('✅ Site publié en production\n');
  return await r.json();
}

// ========================================
// 🔄 SYNCHRONISER UNE COLLECTION
// ========================================
async function syncCollection({ items, collectionId, createFn, updateFn, label, state }) {
  const webflowItems = await fetchWebflowItems(collectionId);
  const webflowIndex = await cleanDuplicates(webflowItems, collectionId);

  console.log(`═══════════════════════════════════════════════════════`);
  console.log(`🔄 SYNC ${label.toUpperCase()}`);
  console.log(`═══════════════════════════════════════════════════════\n`);

  let created = 0, updated = 0, skipped = 0, published = 0, errors = 0;
  const newState = { ...state };

  for (const item of items) {
    try {
      const existingId = webflowIndex.get(item.id);
      const lastSynced = state[item.id];
      const isNew      = !existingId;
      const hasChanged = !lastSynced || lastSynced !== item.updatedAt;

      if (!isNew && !hasChanged) {
        console.log(`⏭️  ${item.title} — inchangé, skip`);
        skipped++;
        continue;
      }

      console.log(`🔍 ${item.title} (ID: ${item.id})`);

      if (existingId) {
        await updateFn(existingId, item);
        console.log(`   ✅ Mis à jour`);
        updated++;
        await publishWebflowItem(existingId, collectionId);
        console.log(`   📢 Publié`);
        published++;
      } else {
        const newItem = await createFn(item);
        console.log(`   ✅ Créé`);
        created++;
        await publishWebflowItem(newItem.id, collectionId);
        console.log(`   📢 Publié`);
        published++;
      }

      newState[item.id] = item.updatedAt;
      await new Promise(r => setTimeout(r, 1100));
    } catch (error) {
      console.error(`   ❌ ERREUR: ${error.message}`);
      errors++;
    }
  }

  console.log(`\n   ⏭️  Skippés (inchangés): ${skipped}`);
  return { created, updated, skipped, published, errors, newState };
}

// ========================================
// 📊 GÉNÉRER LES FICHIERS JSON STATIQUES
// ========================================
async function generateStaticData(produits, categories) {
  console.log('📊 Génération des fichiers JSON statiques...\n');

  // categories.json
  const categoriesJson = JSON.stringify(categories.map(c => ({
    slug:          c.tagProduits || c.handle,
    nom:           c.title,
    description:   c.description,
    image:         c.image,
    tagProduits:   c.tagProduits,
    lienCommander: c.metafields.lienversClickAndCollect,
    affichageHome: c.metafields.produitDuMoment === 'true',
    ordre:         c.metafields.ordreDAffichage || '0'
  })), null, 2);

  // produits.json
  const produitsJson = JSON.stringify(produits.map(p => ({
    id:          p.id,
    slug:        p.handle,
    nom:         p.title,
    description: p.description,
    prix:        p.price,
    image:       p.image,
    tags:        p.tags,
    lienCC:      p.metafields.lienversClickAndCollect
  })), null, 2);

  await pushFileToGitHub('data/categories.json', categoriesJson);
  await pushFileToGitHub('data/produits.json', produitsJson);

  console.log('✅ Fichiers JSON générés\n');
}

// ========================================
// 🚀 FONCTION PRINCIPALE
// ========================================
async function main() {
  try {
    console.log('═══════════════════════════════════════════════════════');
    console.log('🔄 SYNCHRONISATION SHOPIFY → WEBFLOW');
    console.log(`🎯 Environnement: ${ENV.toUpperCase()}`);
    console.log('═══════════════════════════════════════════════════════\n');

    if (ENV === 'staging') {
      console.log('ℹ️  Mode staging — items CMS synchronisés et publiés, site NON republié.\n');
      console.log('   → Vérifie sur https://biscotti-2.webflow.io/ puis publie manuellement.\n');
    } else {
      console.log('🚀 Mode production — items CMS synchronisés, publiés, et site republié.\n');
    }

    const state = loadState();
    console.log(`📂 State chargé: ${Object.keys(state).length} produits suivis\n`);

    const { produits, categories } = await fetchShopifyProducts();

    const statsP = await syncCollection({
      items: produits, collectionId: WEBFLOW_COLLECTION_ID,
      createFn: createWebflowItem, updateFn: updateWebflowItem, label: 'Produits', state
    });

    const statsC = await syncCollection({
      items: categories, collectionId: WEBFLOW_CATEGORIES_COLLECTION_ID,
      createFn: createWebflowCategory, updateFn: updateWebflowCategory, label: 'Catégories', state
    });

    // Générer les fichiers JSON statiques
    await generateStaticData(produits, categories);

    const mergedState = { ...statsP.newState, ...statsC.newState };
    saveStateLocally(mergedState);
    await pushFileToGitHub('sync-state.json', JSON.stringify(mergedState, null, 2));

    if (ENV === 'production') {
      try { await publishSite(); }
      catch (error) { console.error(`❌ Erreur publication du site: ${error.message}`); }
    }

    console.log('\n═══════════════════════════════════════════════════════');
    console.log(`📊 RÉSUMÉ — ${ENV.toUpperCase()}`);
    console.log('═══════════════════════════════════════════════════════');
    console.log('📦 PRODUITS');
    console.log(`   ✅ Créés:        ${statsP.created}`);
    console.log(`   🔄 Mis à jour:   ${statsP.updated}`);
    console.log(`   ⏭️  Skippés:      ${statsP.skipped}`);
    console.log(`   📢 Publiés:      ${statsP.published}`);
    console.log(`   ❌ Erreurs:      ${statsP.errors}`);
    console.log('🗂️  CATÉGORIES');
    console.log(`   ✅ Créées:       ${statsC.created}`);
    console.log(`   🔄 Mises à jour: ${statsC.updated}`);
    console.log(`   ⏭️  Skippées:     ${statsC.skipped}`);
    console.log(`   📢 Publiées:     ${statsC.published}`);
    console.log(`   ❌ Erreurs:      ${statsC.errors}`);
    if (ENV === 'production') console.log(`🌐 Site:          republié en production`);
    else                      console.log(`⏸️  Site:          non republié (staging)`);
    console.log('═══════════════════════════════════════════════════════\n');

  } catch (error) {
    console.error('❌ ERREUR CRITIQUE:', error.message);
    process.exit(1);
  }
}

main();
