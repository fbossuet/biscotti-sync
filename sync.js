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
// 🧹 NETTOYER LES METAFIELDS (VERSION CORRIGÉE)
// ========================================
function cleanMetafieldValue(value) {
  if (!value) return '';
  
  // Si c'est une chaîne qui ressemble à un tableau JSON
  if (typeof value === 'string' && value.trim().startsWith('[')) {
    try {
      const parsed = JSON.parse(value);
      // Si c'est un tableau, prendre le premier élément
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed[0].toString();
      }
    } catch (e) {
      // Si le parsing échoue, continuer avec le traitement normal
    }
  }
  
  // Si c'est déjà une chaîne simple, retourner directement
  if (typeof value === 'string') {
    return value.replace(/^["']|["']$/g, ''); // Enlever les guillemets de début/fin
  }
  
  // Si c'est un objet avec une propriété 'value'
  if (value && typeof value === 'object' && 'value' in value) {
    return cleanMetafieldValue(value.value); // Appel récursif
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
            tags
            descriptionHtml
            featuredImage {
              url
              altText
            }
            images(first: 10) {
              edges {
                node {
                  url
                  altText
                }
              }
            }
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

  const data = await response.json();

  if (data.errors) {
    throw new Error(`Erreur Shopify: ${JSON.stringify(data.errors)}`);
  }

  console.log(`✅ ${data.data.products.edges.length} produits récupérés\n`);

  // Mapper les produits avec TOUTES les données
  const products = data.data.products.edges.map(edge => {
    const product = edge.node;

    // Prix
    const price = product.variants?.edges?.[0]?.node?.price || '0';

    // Metafields
    const metafields = {};
    if (product.metafields?.edges) {
      product.metafields.edges.forEach(({ node }) => {
        const key = `${node.namespace}.${node.key}`;
        metafields[key] = node.value;
      });
    }

    // 🖼️ IMAGE PRINCIPALE (featuredImage)
    const featuredImage = product.featuredImage?.url || null;
    
    // 🖼️ TOUTES LES IMAGES
    const allImages = product.images?.edges?.map(edge => edge.node.url) || [];

    console.log(`📦 Produit: ${product.title}`);
    console.log(`   🖼️  Featured Image: ${featuredImage || '❌ AUCUNE'}`);
    console.log(`   🖼️  Nombre total d'images: ${allImages.length}`);
    if (allImages.length > 0) {
      console.log(`   🖼️  URLs des images:`);
      allImages.forEach((url, i) => {
        console.log(`      ${i + 1}. ${url}`);
      });
    }
    console.log('');

    return {
      id: product.id,
      title: product.title,
      handle: product.handle,
      descriptionHtml: product.descriptionHtml,
      price: price,
      metafields: metafields,
      tags: product.tags ? product.tags.join(', ') : '',
      featuredImage: featuredImage,
      images: allImages
    };
  });

  return products;
}

// ========================================
// 📤 SYNCHRONISER VERS WEBFLOW
// ========================================
async function syncToWebflow(products) {
  console.log('🔄 Synchronisation vers Webflow...\n');

  const stats = {
    created: 0,
    updated: 0,
    published: 0,
    errors: 0
  };

  for (const product of products) {
    try {
      console.log(`🔍 Traitement: ${product.title}`);
      console.log(`   Slug: ${product.handle}`);
      
      // Extraire l'ID numérique
      const shopifyId = product.id.split('/').pop();
      console.log(`   Shopify ID: ${shopifyId}`);
      console.log(`   Tags: ${product.tags || 'Aucun'}`);
      console.log(`   🖼️  Image principale: ${product.featuredImage ? '✅ OUI' : '❌ NON'}`);
      console.log(`   🖼️  Nombre d'images: ${product.images.length}`);

      // Préparer les données pour Webflow
      const webflowData = {
        fieldData: {
          name: product.title,
          slug: product.handle,
          description: cleanHtml(product.descriptionHtml) || '',
          prix: product.price?.toString() || '0',
          'shopify-product-id': shopifyId,
          'shopify-handle': product.handle,
          balise: product.tags || '',
          
          // Metafields nettoyés
          'produit-du-moment': 
            product.metafields['custom.produit_du_moment'] === 'true' ||
            product.metafields['custom.produit_du_moment'] === 'Vrai' ||
            product.metafields['custom.produit_du_moment'] === true,
          
          'encart-vert': cleanMetafieldValue(product.metafields['custom.encart_vert']),
          'date-disponibilite': cleanMetafieldValue(product.metafields['custom.date_disponibilite'])
        }
      };

      // 🖼️ AJOUTER L'IMAGE PRINCIPALE SI ELLE EXISTE
      if (product.featuredImage) {
        console.log(`   🖼️  Ajout de l'image: ${product.featuredImage}`);
        webflowData.fieldData['image-principale'] = {
          url: product.featuredImage
        };
      } else {
        console.log(`   ⚠️  Aucune image principale trouvée`);
      }

      console.log(`   📋 Données à envoyer:`, JSON.stringify(webflowData, null, 2));

      // Vérifier si le produit existe déjà
      const searchResponse = await fetch(
        `https://api.webflow.com/v2/collections/${WEBFLOW_COLLECTION_ID}/items?cmsLocaleId=679abc5615e8e935d6e7d801`,
        {
          headers: {
            'Authorization': `Bearer ${WEBFLOW_TOKEN}`,
            'accept': 'application/json'
          }
        }
      );

      const existingItems = await searchResponse.json();
      const existingItem = existingItems.items?.find(
        item => item.fieldData?.['shopify-product-id'] === shopifyId
      );

      let itemId = null;

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
          itemId = existingItem.id;
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

        const responseData = await createResponse.json();

        if (createResponse.ok) {
          console.log(`   ✅ CRÉÉ avec succès`);
          stats.created++;
          itemId = responseData.id;
        } else {
          console.log(`   ❌ ERREUR lors de la création:`);
          console.log(`   Status: ${createResponse.status}`);
          console.log(`   Réponse:`, JSON.stringify(responseData, null, 2));
          stats.errors++;
        }
      }

      // 🚀 PUBLIER L'ITEM AUTOMATIQUEMENT
      if (itemId) {
        console.log(`   📢 Publication de l'item...`);
        
        const publishResponse = await fetch(
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

        if (publishResponse.ok) {
          console.log(`   ✅ PUBLIÉ avec succès`);
          stats.published++;
        } else {
          const publishError = await publishResponse.text();
          console.log(`   ⚠️  Erreur de publication:`, publishError);
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
    console.log(`📢 Publiés:    ${stats.published}`);
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
