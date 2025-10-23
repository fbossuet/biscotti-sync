// sync.js - Synchronisation Shopify → Webflow CMS
import fetch from 'node-fetch';

// ========================================
// 🔐 CONFIGURATION
// ========================================
const SHOPIFY_STORE = process.env.SHOPIFY_DOMAIN;
const SHOPIFY_TOKEN = process.env.SHOPIFY_TOKEN;
const WEBFLOW_TOKEN = process.env.WEBFLOW_TOKEN;
const WEBFLOW_COLLECTION_ID = process.env.WEBFLOW_COLLECTION_ID;

// ========================================
// 🧹 NETTOYER LES METAFIELDS
// ========================================
function cleanMetafieldValue(value) {
  if (!value) return '';
  
  if (typeof value === 'string' && value.trim().startsWith('[')) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed[0].toString();
      }
    } catch (e) {}
  }
  
  if (typeof value === 'string') {
    return value.replace(/^["']|["']$/g, '');
  }
  
  if (value && typeof value === 'object' && 'value' in value) {
    return cleanMetafieldValue(value.value);
  }
  
  return '';
}

// ========================================
// 🧹 NETTOYER LE HTML
// ========================================
function cleanHtml(html) {
  if (!html) return '';
  
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .trim();
}

// ========================================
// 📦 RÉCUPÉRER LES PRODUITS SHOPIFY
// ========================================
async function fetchShopifyProducts() {
  console.log('🛒 Récupération des produits depuis Shopify...\n');

  const query = `
    {
      products(first: 250) {
        edges {
          node {
            id
            title
            handle
            description
            variants(first: 1) {
              edges {
                node {
                  price
                }
              }
            }
            featuredImage {
              url
            }
            metafields(first: 10) {
              edges {
                node {
                  namespace
                  key
                  value
                }
              }
            }
          }
        }
      }
    }
  `;

  const response = await fetch(`https://${SHOPIFY_STORE}/admin/api/2024-01/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': SHOPIFY_TOKEN
    },
    body: JSON.stringify({ query })
  });

  const data = await response.json();

  if (data.errors) {
    throw new Error(`Erreur Shopify: ${JSON.stringify(data.errors)}`);
  }

  return data.data.products.edges.map(edge => {
    const product = edge.node;
    const metafieldsObj = {};
    
    product.metafields.edges.forEach(metaEdge => {
      const meta = metaEdge.node;
      if (meta.namespace === 'custom') {
        const camelKey = meta.key.replace(/_([a-z])/g, (g) => g[1].toUpperCase());
        metafieldsObj[camelKey] = meta.value;
      }
    });

    const price = product.variants.edges[0]?.node.price || '0.00';
    const featuredImage = product.featuredImage?.url || null;

    return {
      id: product.id.split('/').pop(),
      title: product.title,
      handle: product.handle,
      description: product.description || '',
      price: price,
      featuredImage: featuredImage,
      metafields: metafieldsObj
    };
  });
}

// ========================================
// 🌐 RÉCUPÉRER TOUS LES ITEMS WEBFLOW
// ========================================
async function fetchAllWebflowItems() {
  console.log('🌐 Récupération des items Webflow existants...\n');
  
  let allItems = [];
  let offset = 0;
  const limit = 100;
  
  while (true) {
    const response = await fetch(
      `https://api.webflow.com/v2/collections/${WEBFLOW_COLLECTION_ID}/items?limit=${limit}&offset=${offset}`,
      {
        headers: {
          'Authorization': `Bearer ${WEBFLOW_TOKEN}`,
          'accept': 'application/json'
        }
      }
    );

    const data = await response.json();
    
    if (!data.items || data.items.length === 0) break;
    
    allItems = allItems.concat(data.items);
    
    if (data.items.length < limit) break;
    
    offset += limit;
  }

  console.log(`✅ ${allItems.length} items trouvés dans Webflow\n`);
  return allItems;
}

// ========================================
// ➕ CRÉER UN ITEM WEBFLOW
// ========================================
async function createWebflowItem(product) {
  const webflowData = {
    fieldData: {
      'name': product.title,
      'slug': product.handle,
      'description': cleanHtml(product.description),
      'prix': product.price,
      'shopify-product-id': product.id,
      'shopify-handle': product.handle,
      'produit-du-moment': product.metafields.produitDuMoment === 'true',
      'encart-vert': cleanMetafieldValue(product.metafields.encartVert),
      'date-disponibilite': cleanMetafieldValue(product.metafields.dateDisponibilite),
    }
  };

  // Ajouter l'image si présente
  if (product.featuredImage) {
    webflowData.fieldData['image-principale'] = {
      url: product.featuredImage
    };
  }

  const response = await fetch(
    `https://api.webflow.com/v2/collections/${WEBFLOW_COLLECTION_ID}/items`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${WEBFLOW_TOKEN}`,
        'Content-Type': 'application/json',
        'accept': 'application/json'
      },
      body: JSON.stringify(webflowData)
    }
  );

  const result = await response.json();

  if (!response.ok) {
    throw new Error(`Erreur ${response.status}: ${JSON.stringify(result)}`);
  }

  return result.id;
}

// ========================================
// 🔄 METTRE À JOUR UN ITEM WEBFLOW
// ========================================
async function updateWebflowItem(itemId, product) {
  const webflowData = {
    fieldData: {
      'name': product.title,
      'slug': product.handle,
      'description': cleanHtml(product.description),
      'prix': product.price,
      'shopify-product-id': product.id,
      'shopify-handle': product.handle,
      'produit-du-moment': product.metafields.produitDuMoment === 'true',
      'encart-vert': cleanMetafieldValue(product.metafields.encartVert),
      'date-disponibilite': cleanMetafieldValue(product.metafields.dateDisponibilite),
    }
  };

  // Ajouter l'image si présente
  if (product.featuredImage) {
    webflowData.fieldData['image-principale'] = {
      url: product.featuredImage
    };
  }

  const response = await fetch(
    `https://api.webflow.com/v2/collections/${WEBFLOW_COLLECTION_ID}/items/${itemId}`,
    {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${WEBFLOW_TOKEN}`,
        'Content-Type': 'application/json',
        'accept': 'application/json'
      },
      body: JSON.stringify(webflowData)
    }
  );

  const result = await response.json();

  if (!response.ok) {
    throw new Error(`Erreur ${response.status}: ${JSON.stringify(result)}`);
  }

  return result;
}

// ========================================
// 📢 PUBLIER UN ITEM WEBFLOW
// ========================================
async function publishWebflowItem(itemId) {
  const response = await fetch(
    `https://api.webflow.com/v2/collections/${WEBFLOW_COLLECTION_ID}/items/publish`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${WEBFLOW_TOKEN}`,
        'Content-Type': 'application/json',
        'accept': 'application/json'
      },
      body: JSON.stringify({
        itemIds: [itemId]
      })
    }
  );

  if (!response.ok) {
    const result = await response.json();
    throw new Error(`Erreur publication: ${JSON.stringify(result)}`);
  }
}

// ========================================
// 🎯 SYNCHRONISATION PRINCIPALE
// ========================================
async function main() {
  try {
    console.log('═══════════════════════════════════════════════════════');
    console.log('🚀 DÉMARRAGE DE LA SYNCHRONISATION SHOPIFY → WEBFLOW');
    console.log('═══════════════════════════════════════════════════════\n');

    // Récupérer les données
    const products = await fetchShopifyProducts();
    const webflowItems = await fetchAllWebflowItems();

    // Créer un index des items Webflow par shopify-product-id
    const webflowIndex = new Map();
    webflowItems.forEach(item => {
      const shopifyId = item.fieldData['shopify-product-id'];
      if (shopifyId) {
        webflowIndex.set(shopifyId, item.id);
      }
    });

    let created = 0;
    let updated = 0;
    let published = 0;
    let errors = 0;

    // Synchroniser chaque produit
    for (const product of products) {
      try {
        console.log(`\n🔍 ${product.title} (ID: ${product.id})`);

        const existingItemId = webflowIndex.get(product.id);

        if (existingItemId) {
          // MISE À JOUR
          console.log(`   🔄 Mise à jour...`);
          await updateWebflowItem(existingItemId, product);
          console.log(`   ✅ Mis à jour`);
          updated++;

          // Publier
          await publishWebflowItem(existingItemId);
          console.log(`   📢 Publié`);
          published++;

        } else {
          // CRÉATION
          console.log(`   ➕ Création...`);
          const newItemId = await createWebflowItem(product);
          console.log(`   ✅ Créé`);
          created++;

          // Publier
          await publishWebflowItem(newItemId);
          console.log(`   📢 Publié`);
          published++;
        }

        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 1100));

      } catch (error) {
        console.error(`   ❌ ERREUR: ${error.message}`);
        errors++;
      }
    }

    // Résumé
    console.log('\n═══════════════════════════════════════════════════════');
    console.log('📊 RÉSUMÉ DE LA SYNCHRONISATION');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`✅ Créés:      ${created}`);
    console.log(`🔄 Mis à jour: ${updated}`);
    console.log(`📢 Publiés:    ${published}`);
    console.log(`❌ Erreurs:    ${errors}`);
    console.log(`📦 Total:      ${products.length}`);
    console.log('═══════════════════════════════════════════════════════\n');

  } catch (error) {
    console.error('❌ ERREUR CRITIQUE:', error.message);
    process.exit(1);
  }
}

// Lancer la synchronisation
main();
