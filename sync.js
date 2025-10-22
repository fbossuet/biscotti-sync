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
  
  // Si c'est déjà une chaîne simple, retourner directement
  if (typeof value === 'string') return value;
  
  // Si c'est un objet avec une propriété 'value'
  if (value && typeof value === 'object' && 'value' in value) {
    return value.value?.toString() || '';
  }
  
  return '';
}

// ========================================
// 🧹 NETTOYER LE HTML (enlever les balises)
// ========================================
function cleanHtml(html) {
  if (!html) return '';
  
  return html
    // Remplacer les <br> et <br/> par des retours à la ligne
    .replace(/<br\s*\/?>/gi, '\n')
    // Remplacer les </p> par double retour à la ligne
    .replace(/<\/p>/gi, '\n\n')
    // Enlever toutes les autres balises HTML
    .replace(/<[^>]*>/g, '')
    // Décoder les entités HTML
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    // Nettoyer les espaces multiples
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ========================================
// 📥 RÉCUPÉRER LES PRODUITS DEPUIS SHOPIFY
// ========================================
async function fetchShopifyProducts() {
  console.log('🛒 Récupération des produits depuis Shopify...\n');

  const query = `
    query {
      products(first: 250) {
        edges {
          node {
            id
            title
            handle
            descriptionHtml
            variants(first: 1) {
              edges {
                node {
                  price
                }
              }
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

  try {
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
      const errorText = await response.text();
      throw new Error(`Erreur Shopify (${response.status}): ${errorText}`);
    }

    const data = await response.json();

    if (data.errors) {
      throw new Error(`Erreur GraphQL: ${JSON.stringify(data.errors)}`);
    }

    const products = data.data.products.edges.map(edge => {
      const product = edge.node;
      
      // Extraire le prix
      const price = product.variants?.edges?.[0]?.node?.price || '0';
      
      // Convertir les metafields en objet clé-valeur
      const metafields = {};
      if (product.metafields?.edges) {
        product.metafields.edges.forEach(({ node }) => {
          const key = `${node.namespace}.${node.key}`;
          metafields[key] = node.value;
        });
      }

      return {
        id: product.id,
        title: product.title,
        handle: product.handle,
        descriptionHtml: product.descriptionHtml,
        price: price,
        metafields: metafields
      };
    });

    console.log(`   ✅ ${products.length} produits récupérés depuis Shopify\n`);
    
    // Debug : afficher les metafields du premier produit
    if (products.length > 0) {
      console.log('📋 Exemple de metafields du premier produit:');
      console.log(JSON.stringify(products[0].metafields, null, 2));
      console.log('');
    }

    return products;

  } catch (error) {
    console.error('❌ Erreur lors de la récupération des produits Shopify:', error.message);
    throw error;
  }
}

// ========================================
// 📥 RÉCUPÉRER TOUS LES ITEMS WEBFLOW
// ========================================
async function fetchAllWebflowItems() {
  let allItems = [];
  let offset = 0;
  const limit = 100;
  let hasMore = true;

  while (hasMore) {
    try {
      const response = await fetch(
        `https://api.webflow.com/v2/collections/${WEBFLOW_COLLECTION_ID}/items?limit=${limit}&offset=${offset}`,
        {
          headers: {
            'Authorization': `Bearer ${WEBFLOW_TOKEN}`,
            'accept': 'application/json'
          }
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Erreur Webflow (${response.status}): ${errorText}`);
      }

      const data = await response.json();
      
      if (data.items && data.items.length > 0) {
        allItems = allItems.concat(data.items);
        offset += limit;
        
        // Vérifier s'il y a plus d'items
        hasMore = data.items.length === limit;
      } else {
        hasMore = false;
      }

      // Pause pour respecter les limites de l'API
      if (hasMore) {
        await new Promise(resolve => setTimeout(resolve, 300));
      }

    } catch (error) {
      console.error('❌ Erreur lors de la récupération des items Webflow:', error.message);
      throw error;
    }
  }

  return allItems;
}

// ========================================
// 🔄 SYNCHRONISER VERS WEBFLOW
// ========================================
async function syncToWebflow(products) {
  console.log('🔄 Synchronisation vers Webflow...\n');
  
  const stats = {
    created: 0,
    updated: 0,
    errors: 0
  };

  // 1. Récupérer TOUS les items existants dans Webflow
  console.log('📥 Récupération des items Webflow existants...');
  const existingItems = await fetchAllWebflowItems();
  console.log(`   ✅ ${existingItems.length} items trouvés dans Webflow\n`);

  // 2. Créer un index par slug ET par shopify-product-id
  const itemsBySlug = {};
  const itemsByShopifyId = {};
  
  existingItems.forEach(item => {
    if (item.fieldData?.slug) {
      itemsBySlug[item.fieldData.slug] = item;
    }
    if (item.fieldData?.['shopify-product-id']) {
      itemsByShopifyId[item.fieldData['shopify-product-id']] = item;
    }
  });

  console.log(`📊 Index créé: ${Object.keys(itemsBySlug).length} slugs, ${Object.keys(itemsByShopifyId).length} IDs Shopify\n`);

  // 3. Traiter chaque produit
  for (const product of products) {
    try {
      console.log(`\n🔍 Traitement: ${product.title}`);
      console.log(`   Slug: ${product.handle}`);
      
      const shopifyId = product.id.replace('gid://shopify/Product/', '');
      console.log(`   Shopify ID: ${shopifyId}`);

      // Chercher le produit existant
      let existingItem = itemsByShopifyId[shopifyId] || itemsBySlug[product.handle];
      
      if (existingItem) {
        console.log(`   ✅ TROUVÉ dans Webflow (ID: ${existingItem.id})`);
      } else {
        console.log(`   ℹ️  PAS TROUVÉ dans Webflow → Création`);
      }

      // Préparer les données
      const webflowData = {
        fieldData: {
          name: product.title,
          slug: product.handle,
          description: cleanHtml(product.descriptionHtml) || '',
          prix: product.price?.toString() || '0',
          'shopify-product-id': shopifyId,
          'shopify-handle': product.handle,
          
          // Metafields nettoyés
          'produit-du-moment': 
            product.metafields['custom.produit_du_moment'] === 'true' ||
            product.metafields['custom.produit_du_moment'] === 'Vrai' ||
            product.metafields['custom.produit_du_moment'] === true,
          
          'encart-vert': cleanMetafieldValue(product.metafields['custom.encart_vert']),
          'date-disponibilite': cleanMetafieldValue(product.metafields['custom.date_disponibilite'])
        }
      };

      // Mise à jour ou création
      if (existingItem) {
        console.log(`   🔄 Tentative de MISE À JOUR...`);
        
        const updateResponse = await fetch(
          `https://api.webflow.com/v2/collections/${WEBFLOW_COLLECTION_ID}/items/${existingItem.id}`,
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

        const responseText = await updateResponse.text();
        
        if (updateResponse.ok) {
          console.log(`   ✅ MIS À JOUR avec succès`);
          stats.updated++;
        } else {
          console.log(`   ❌ ERREUR lors de la mise à jour:`);
          console.log(`   Status: ${updateResponse.status}`);
          console.log(`   Réponse:`, responseText);
          stats.errors++;
        }

      } else {
        console.log(`   ➕ Tentative de CRÉATION...`);
        
        const createResponse = await fetch(
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

        const responseText = await createResponse.text();

        if (createResponse.ok) {
          console.log(`   ✅ CRÉÉ avec succès`);
          stats.created++;
        } else {
          console.log(`   ❌ ERREUR lors de la création:`);
          console.log(`   Status: ${createResponse.status}`);
          console.log(`   Réponse:`, responseText);
          stats.errors++;
        }
      }

      // Pause pour respecter les limites de l'API
      await new Promise(resolve => setTimeout(resolve, 1100));

    } catch (error) {
      console.log(`   ❌ EXCEPTION pour ${product.title}:`, error.message);
      stats.errors++;
    }
  }

  return stats;
}

// ========================================
// 🚀 FONCTION PRINCIPALE
// ========================================
async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('🔄 SYNCHRONISATION SHOPIFY → WEBFLOW');
  console.log('═══════════════════════════════════════════════════════\n');

  try {
    // 1. Récupérer les produits Shopify
    const products = await fetchShopifyProducts();

    if (products.length === 0) {
      console.log('⚠️  Aucun produit trouvé dans Shopify\n');
      return;
    }

    // 2. Synchroniser vers Webflow
    const stats = await syncToWebflow(products);

    // 3. Afficher le résumé
    console.log('\n═══════════════════════════════════════════════════════');
    console.log('📊 RÉSUMÉ DE LA SYNCHRONISATION');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`✅ Créés:      ${stats.created}`);
    console.log(`🔄 Mis à jour: ${stats.updated}`);
    console.log(`❌ Erreurs:    ${stats.errors}`);
    console.log(`📦 Total:      ${products.length}`);
    console.log('═══════════════════════════════════════════════════════\n');

  } catch (error) {
    console.error('❌ ERREUR CRITIQUE:', error.message);
    process.exit(1);
  }
}

// Lancer la synchronisation
main();
