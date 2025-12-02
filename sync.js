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
  console.log('🛒 Récupération des produits Shopify...\n');
  
  const query = `
    query {
      products(first: 250) {
        edges {
          node {
            id
            title
            handle
            description
            featuredImage {
              url
            }
            tags
            variants(first: 1) {
              edges {
                node {
                  price
                }
              }
            }
            metafields(first: 20) {
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

  const response = await fetch(
    `https://${SHOPIFY_STORE}/admin/api/2024-01/graphql.json`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': SHOPIFY_TOKEN
      },
      body: JSON.stringify({ query })
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Erreur Shopify ${response.status}: ${error}`);
  }

  const data = await response.json();

  if (data.errors) {
    throw new Error(`Erreur GraphQL: ${JSON.stringify(data.errors)}`);
  }

  const products = data.data.products.edges.map(edge => {
    const product = edge.node;
    
    const metafields = {};
    product.metafields.edges.forEach(({ node }) => {
      const key = node.key.replace(/-/g, '_');
      const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
      metafields[camelKey] = cleanMetafieldValue(node.value);
    });

    return {
      id: product.id.replace('gid://shopify/Product/', ''),
      title: product.title,
      handle: product.handle,
      description: product.description || '',
      price: product.variants.edges[0]?.node.price || '0',
      image: product.featuredImage?.url || null,
      tags: product.tags ? product.tags.join(', ') : '',
      metafields: {
        produitDuMoment: metafields.produitDuMoment || 'false',
        encartVert: metafields.encartVert || '',
        dateDisponibilite: metafields.dateDisponibilite || ''
      }
    };
  });

  console.log(`✅ ${products.length} produits récupérés\n`);
  return products;
}

// ========================================
// 📋 RÉCUPÉRER TOUS LES ITEMS WEBFLOW
// ========================================
async function fetchWebflowItems() {
  console.log('📋 Récupération des items Webflow existants...\n');
  
  const items = [];
  let offset = 0;
  const limit = 100;

  while (true) {
    const url = `https://api.webflow.com/v2/collections/${WEBFLOW_COLLECTION_ID}/items?limit=${limit}&offset=${offset}`;
    
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${WEBFLOW_TOKEN}`,
        'accept': 'application/json'
      }
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Erreur ${response.status}: ${error}`);
    }

    const data = await response.json();
    
    // Filtrer les items valides
    const validItems = data.items.filter(item => 
      item.fieldData && 
      item.fieldData['shopify-product-id'] &&
      item.id
    );

    items.push(...validItems);

    console.log(`   📦 ${items.length} items chargés...`);

    if (!data.items || data.items.length < limit) {
      break;
    }

    offset += limit;
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  console.log(`✅ Total: ${items.length} items\n`);
  return items;
}

// ========================================
// 🧹 NETTOYER LES DOUBLONS
// ========================================
async function cleanDuplicates(items) {
  console.log('🧹 Vérification des doublons...\n');

  const grouped = new Map();
  
  items.forEach(item => {
    const shopifyId = item.fieldData['shopify-product-id'];
    if (!shopifyId) return;
    
    if (!grouped.has(shopifyId)) {
      grouped.set(shopifyId, []);
    }
    grouped.get(shopifyId).push(item);
  });

  let deleted = 0;
  const toKeep = new Map();
  
  for (const [shopifyId, duplicates] of grouped) {
    if (duplicates.length > 1) {
      console.log(`⚠️  Doublon: ${duplicates[0].fieldData.name} (${duplicates.length} copies)`);
      
      // Garder le premier
      toKeep.set(shopifyId, duplicates[0].id);
      
      // Supprimer les autres
      for (let i = 1; i < duplicates.length; i++) {
        const itemId = duplicates[i].id;
        console.log(`   🗑️  Suppression: ${itemId}`);
        
        try {
          await fetch(
            `https://api.webflow.com/v2/collections/${WEBFLOW_COLLECTION_ID}/items/${itemId}`,
            {
              method: 'DELETE',
              headers: {
                'Authorization': `Bearer ${WEBFLOW_TOKEN}`,
                'accept': 'application/json'
              }
            }
          );
          
          deleted++;
          await new Promise(resolve => setTimeout(resolve, 500));
        } catch (error) {
          console.log(`   ❌ Erreur suppression: ${error.message}`);
        }
      }
    } else {
      toKeep.set(shopifyId, duplicates[0].id);
    }
  }

  if (deleted > 0) {
    console.log(`\n✅ ${deleted} doublons supprimés\n`);
  } else {
    console.log(`✅ Aucun doublon\n`);
  }

  return toKeep;
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
      'balise': product.tags,
      
      'produit-du-moment': product.metafields.produitDuMoment === 'true',
      'encart-vert': product.metafields.encartVert,
      'date-disponibilite': product.metafields.dateDisponibilite,
      'lien-click-and-collect': product.metafields.lienClickAndCollect
    }
  };

  if (product.image) {
    webflowData.fieldData['image-principale'] = { url: product.image };
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

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Erreur ${response.status}: ${JSON.stringify(error)}`);
  }

  return await response.json();
}

// ========================================
// 🔄 METTRE À JOUR UN ITEM WEBFLOW
// ========================================
async function updateWebflowItem(itemId, product) {
  if (!itemId || itemId === 'undefined') {
    throw new Error('ID Webflow invalide');
  }

  const webflowData = {
    fieldData: {
      'name': product.title,
      'slug': product.handle,
      'description': cleanHtml(product.description),
      'prix': product.price,
      'shopify-product-id': product.id,
      'shopify-handle': product.handle,
      'balise': product.tags,
      
      'produit-du-moment': product.metafields.produitDuMoment === 'true',
      'encart-vert': product.metafields.encartVert,
      'date-disponibilite': product.metafields.dateDisponibilite,
      'lien-click-and-collect': product.metafields.lienClickAndCollect,
      'lien-click-and-collect': product.metafields.lienClickAndCollect,
    }
  };

  if (product.image) {
    webflowData.fieldData['image-principale'] = { url: product.image };
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

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Erreur ${response.status}: ${JSON.stringify(error)}`);
  }

  return await response.json();
}

// ========================================
// 📢 PUBLIER UN ITEM
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
    const error = await response.json();
    throw new Error(`Erreur publication ${response.status}: ${JSON.stringify(error)}`);
  }

  return await response.json();
}

// ========================================
// 🚀 FONCTION PRINCIPALE
// ========================================
async function main() {
  try {
    console.log('═══════════════════════════════════════════════════════');
    console.log('🔄 SYNCHRONISATION SHOPIFY → WEBFLOW');
    console.log('═══════════════════════════════════════════════════════\n');

    // 1. Récupérer les produits Shopify
    const products = await fetchShopifyProducts();

    // 2. Récupérer les items Webflow
    const webflowItems = await fetchWebflowItems();

    // 3. Nettoyer les doublons et créer l'index
    const webflowIndex = await cleanDuplicates(webflowItems);

    console.log('═══════════════════════════════════════════════════════');
    console.log('🔄 SYNCHRONISATION EN COURS');
    console.log('═══════════════════════════════════════════════════════\n');

    let created = 0;
    let updated = 0;
    let published = 0;
    let errors = 0;

    // 4. Synchroniser chaque produit
    for (const product of products) {
      try {
        console.log(`🔍 ${product.title} (ID: ${product.id})`);

        const existingItemId = webflowIndex.get(product.id);

        if (existingItemId) {
          // Mise à jour
          console.log(`   🔄 Mise à jour...`);
          await updateWebflowItem(existingItemId, product);
          console.log(`   ✅ Mis à jour`);
          updated++;

          // Publier
          await publishWebflowItem(existingItemId);
          console.log(`   📢 Publié`);
          published++;

        } else {
          // Création
          console.log(`   ➕ Création...`);
          const newItem = await createWebflowItem(product);
          const newItemId = newItem.id;
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
