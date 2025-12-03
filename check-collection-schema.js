// check-collection-schema.js - Voir TOUS les champs de la collection
import fetch from 'node-fetch';

const WEBFLOW_TOKEN = process.env.WEBFLOW_TOKEN;
const WEBFLOW_COLLECTION_ID = process.env.WEBFLOW_COLLECTION_ID;

async function checkCollectionSchema() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('🔍 STRUCTURE COMPLÈTE DE LA COLLECTION WEBFLOW');
  console.log('═══════════════════════════════════════════════════════\n');

  const response = await fetch(
    `https://api.webflow.com/v2/collections/${WEBFLOW_COLLECTION_ID}`,
    {
      headers: {
        'Authorization': `Bearer ${WEBFLOW_TOKEN}`,
        'accept': 'application/json'
      }
    }
  );

  if (!response.ok) {
    const error = await response.text();
    console.error('❌ Erreur:', error);
    return;
  }

  const collection = await response.json();
  
  console.log(`✅ Collection: ${collection.displayName}\n`);
  console.log('📋 TOUS LES CHAMPS DE LA COLLECTION:\n');
  
  if (collection.fields) {
    collection.fields.forEach(field => {
      console.log(`   "${field.slug}" (${field.type})`);
      if (field.displayName) {
        console.log(`      → Label: "${field.displayName}"`);
      }
    });
    
    console.log('\n🔍 CHAMPS CONTENANT "ordre" OU "affichage":\n');
    collection.fields.forEach(field => {
      if (field.slug.includes('ordre') || field.slug.includes('affichage') || 
          field.displayName?.includes('ordre') || field.displayName?.includes('affichage')) {
        console.log(`   ✓✓✓ TROUVÉ: "${field.slug}" ✓✓✓`);
        console.log(`       Type: ${field.type}`);
        console.log(`       Label: ${field.displayName}`);
      }
    });
    
    console.log('\n🔍 CHAMPS CONTENANT "lien" OU "click":\n');
    collection.fields.forEach(field => {
      if (field.slug.includes('lien') || field.slug.includes('click') || 
          field.displayName?.includes('lien') || field.displayName?.includes('click')) {
        console.log(`   ✓✓✓ TROUVÉ: "${field.slug}" ✓✓✓`);
        console.log(`       Type: ${field.type}`);
        console.log(`       Label: ${field.displayName}`);
      }
    });
    
    console.log('\n');
  }
}

checkCollectionSchema().catch(error => {
  console.error('❌ ERREUR:', error.message);
  process.exit(1);
});
