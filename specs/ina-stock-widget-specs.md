# Spécifications fonctionnelles - Widget de gestion de stock INA Campus

## 1. Contexte & Objectif

### 1.1 Contexte projet
L'INA Campus gère un parc de ~600 unités (300 Mac, 300 PC, serveurs, logiciels/licences) réparties entre des locaux de stock (LS) et des salles de cours (SC). Le matériel du local de stock est **réservable** par les formateurs/planificateurs pour des périodes de formation. Le matériel en salle de cours est **fixe** (non réservable).

Monday.com est utilisé pour gérer les demandes, l'inventaire et les réservations. Cependant, Monday ne couvre pas nativement le besoin de **vérification de disponibilité sur une plage de dates flottante**. Une app custom est donc nécessaire.

### 1.2 Objectif du widget
Le widget s'affiche dans la **vue sous-élément** d'une demande de matériel. Il permet de :
1. Vérifier la disponibilité d'un type de matériel sur une plage de dates donnée
2. Réserver le matériel disponible (création automatique des lignes de réservation)
3. Proposer des alternatives de la même famille/sous-famille en cas d'indisponibilité partielle ou totale

### 1.3 Objectif business
Cette app est développée dans le cadre du projet INA Campus mais a vocation à être **monétisée sur la Marketplace Monday.com** comme solution générique de gestion de stock avec réservation par plages de dates.

---

## 2. Modèle de données Monday.com

### 2.1 Vue d'ensemble des tableaux

Le widget s'appuie sur **4 tableaux interconnectés** :

```
┌──────────────────────┐
│   Demandes           │  (tableau principal)
│   + Sous-éléments    │  (1 sous-élément par besoin matériel)
└──────────┬───────────┘
           │ lié à
           ▼
┌──────────────────────┐       ┌──────────────────────┐
│ Familles             │◄──────│ Equipements          │
│ d'équipements        │       │ individuels          │
│ (catalogue)          │       │ (inventaire)         │
└──────────────────────┘       └──────────┬───────────┘
                                          │ lié à
                                          ▼
                               ┌──────────────────────┐
                               │ Réservations         │
                               │ (1 ligne/équipement/ │
                               │  plage de dates)     │
                               └──────────────────────┘
```

### 2.2 Tableau "Demandes" (existant)

Tableau principal des demandes entrantes via le portail Monday.

| Colonne | Type | Description |
|---------|------|-------------|
| Ticket | Texte | Nom de la demande |
| Description de la demande | Texte long | Détail de la demande |
| Nom du demandeur | Texte | Identifié automatiquement |
| Email du demandeur | Email | Identifié automatiquement |
| Agent | Personne | Agent assigné |
| Statut | Statut | Demande en attente / En option / En cours / Terminée |
| Priorité | Statut | Haute / Moyenne / Basse |
| Type de demande | Statut | Matériel / Support / Logiciel |
| Commentaire | Texte long | Champ libre pour besoins complémentaires |

**Sous-éléments de demande** (1 par besoin matériel) :

| Colonne | Type | Description |
|---------|------|-------------|
| Sous-élément | Texte | Nom du besoin (ex: "5 ordinateurs portables") |
| Echéances | Plage de dates | Date début - Date fin de la réservation souhaitée |
| Matériel requis | Connexion | Lien vers le tableau "Familles d'équipements" |
| Qté. requise | Nombre | Nombre d'unités demandées |
| Commentaire | Texte long | Précisions |
| Catalogue d'inventaire informatique | Connexion | Lien vers famille d'équipement sélectionnée |
| Type de matériel | Statut/Dropdown | Famille générique demandée |

### 2.3 Tableau "Familles d'équipements" (catalogue)

Regroupe les types d'équipements avec leurs caractéristiques et stock total.

| Colonne | Type | Description |
|---------|------|-------------|
| Elément | Texte | Nom du modèle (ex: "DELL Precision 3460") |
| Date d'acquisition | Date | Date d'achat |
| Version/Modèle | Texte | Référence constructeur |
| Responsable | Personne | Responsable de ce type d'équipement |
| Statut | Statut | En maintenance / En usage / En stock / Hors service / Pas en stock |
| Famille | Statut/Dropdown | Matériel Informatique / Matériel Audiovisuel / Logiciels |
| Sous-famille | Statut/Dropdown | Ordinateurs / Ecrans / Adaptateurs / Téléphones / etc. |
| Catégories | Statut/Dropdown | Desktops / Laptops / All-in-one / Dock / etc. |
| Système d'exploitation | Statut/Dropdown | Windows / Apple / Linux |
| Quantité Totale | Nombre | Stock total pour ce modèle |
| Quantité LS | Nombre | Quantité en local de stock (réservable) |
| Local de Stock (LS) Réservable | Texte/Lieu | Identifiant du local de stock |
| Quantité SC | Nombre | Quantité en salle de cours (non réservable) |
| Salles de Cours (SC) Non Réservable | Texte | Identifiant(s) des salles |

**Groupes** : organisés dynamiquement par sous-famille (Adaptateurs/Dock, Ordinateurs, Ecrans, etc.)

### 2.4 Tableau "Equipements individuels" (inventaire)

Une ligne par équipement physique unitaire.

| Colonne | Type | Description |
|---------|------|-------------|
| Elément | Texte | Identifiant/nom de l'équipement |
| Numéro de série | Texte | Serial number unique |
| Code-barres INA | Texte | Code-barres interne INA |
| Statut | Statut | **Disponible** / **Réservé** / **Occupé** / **En maintenance** / **Hors service** |
| Famille d'équipement | Connexion | Lien vers "Familles d'équipements" |
| Localisation | Statut/Dropdown | Issy-les-Moulineaux / Brie / Local sécurisé / Local technique |
| Réservable | Checkbox | Indique si l'équipement est réservable |
| Réservation en cours | Connexion | Lien vers la réservation active |

### 2.5 Tableau "Réservations"

Une ligne par équipement individuel réservé sur une plage de dates.

| Colonne | Type | Description |
|---------|------|-------------|
| Réservation | Texte (auto) | Identifiant de la réservation |
| Equipement individuel | Connexion | Lien vers l'équipement unitaire réservé |
| Famille d'équipement | Connexion (miroir) | Famille de l'équipement (déduit) |
| Plage de réservation | Plage de dates | Date début - Date fin |
| Demande liée | Connexion | Lien vers le sous-élément de demande |
| Demandeur | Texte (miroir) | Nom du demandeur (déduit de la demande) |
| Statut | Statut | **Pré-réservé** / **Confirmé** / **En cours** / **Terminé** / **Annulé** |

---

## 3. Spécifications du widget "Disponibilité & Réservation"

### 3.1 Type d'app Monday
- **Type** : Item View (vue au niveau du sous-élément de demande)
- **SDK** : monday-sdk-js
- **Emplacement** : S'affiche dans le panneau latéral ou en vue étendue d'un sous-élément de la demande de matériel

### 3.2 Données d'entrée (contexte du sous-élément)

Le widget lit automatiquement les colonnes du sous-élément sur lequel il est ouvert :

| Donnée | Source | Obligatoire |
|--------|--------|-------------|
| Plage de dates souhaitée | Colonne "Echéances" du sous-élément | Oui |
| Famille/sous-famille demandée | Colonne "Catalogue d'inventaire" ou "Type de matériel" | Oui |
| Quantité demandée | Colonne "Qté. requise" | Oui |

Si une donnée obligatoire est manquante, le widget affiche un message d'erreur guidant l'utilisateur vers le champ à remplir.

### 3.3 Ecran principal : Vérification de disponibilité

#### 3.3.1 Logique de calcul de disponibilité

```
Pour une famille/sous-famille F et une plage de dates [D1, D2] :

1. Récupérer tous les équipements individuels liés à F
   WHERE statut IN ('Disponible', 'Réservé')
   AND réservable = true

2. Pour chaque équipement individuel :
   - Vérifier dans le tableau Réservations s'il existe une réservation
     dont la plage chevauche [D1, D2]
     (chevauchement = résa.début <= D2 AND résa.fin >= D1)
     AND statut IN ('Pré-réservé', 'Confirmé', 'En cours')
   - Si aucun chevauchement → l'équipement est DISPONIBLE sur cette plage
   - Si chevauchement → l'équipement est INDISPONIBLE sur cette plage

3. Exclure les équipements avec statut 'En maintenance' ou 'Hors service'

4. Stock disponible = nombre d'équipements sans chevauchement de réservation
```

#### 3.3.2 Affichage

Le widget affiche :

```
┌─────────────────────────────────────────────────────────┐
│  Disponibilité matériel                                 │
│                                                         │
│  📋 DELL Precision 3460 (Ordinateurs > Desktops)       │
│  📅 Du 30/06/2026 au 03/07/2026                        │
│  📦 Demandé : 5 unités                                 │
│                                                         │
│  ┌─────────────────────────────────────────────┐        │
│  │  ✅ 5 unités disponibles sur 8 au total     │        │
│  │                                              │        │
│  │  Quantité à réserver : [5]  ▼                │        │
│  │                                              │        │
│  │  [ Réserver le matériel ]                    │        │
│  └─────────────────────────────────────────────┘        │
└─────────────────────────────────────────────────────────┘
```

**Cas : disponibilité partielle**

```
┌─────────────────────────────────────────────────────────┐
│  Disponibilité matériel                                 │
│                                                         │
│  📋 DELL Precision 3460 (Ordinateurs > Desktops)       │
│  📅 Du 30/06/2026 au 03/07/2026                        │
│  📦 Demandé : 5 unités                                 │
│                                                         │
│  ┌─────────────────────────────────────────────┐        │
│  │  ⚠️ 3 unités disponibles sur 8 au total     │        │
│  │     (2 réservées, 3 en maintenance)          │        │
│  │                                              │        │
│  │  Quantité à réserver : [3]  ▼                │        │
│  │                                              │        │
│  │  [ Réserver 3 unités ]                       │        │
│  └─────────────────────────────────────────────┘        │
│                                                         │
│  ──── Matériel alternatif disponible ────               │
│  (même sous-famille : Ordinateurs > Desktops)           │
│                                                         │
│  ┌─────────────────────────────────────────────┐        │
│  │  DELL Precision T1700         3 disponibles  │        │
│  │  DELL Precision Tower 7920    2 disponibles  │        │
│  │  DELL Precision T3500         1 disponible   │        │
│  │                                              │        │
│  │  [ Sélectionner pour compléter ]             │        │
│  └─────────────────────────────────────────────┘        │
└─────────────────────────────────────────────────────────┘
```

**Cas : aucune disponibilité**

```
┌─────────────────────────────────────────────────────────┐
│  Disponibilité matériel                                 │
│                                                         │
│  📋 DELL Precision 3460 (Ordinateurs > Desktops)       │
│  📅 Du 30/06/2026 au 03/07/2026                        │
│  📦 Demandé : 5 unités                                 │
│                                                         │
│  ┌─────────────────────────────────────────────┐        │
│  │  ❌ Aucune unité disponible sur cette plage  │        │
│  │     (5 réservées, 3 en maintenance)          │        │
│  └─────────────────────────────────────────────┘        │
│                                                         │
│  ──── Matériel alternatif disponible ────               │
│  (même sous-famille : Ordinateurs > Desktops)           │
│                                                         │
│  ┌─────────────────────────────────────────────┐        │
│  │  DELL Precision T1700         3 disponibles  │        │
│  │  DELL Precision Tower 7920    2 disponibles  │        │
│  │                                              │        │
│  │  [ Sélectionner pour compléter ]             │        │
│  └─────────────────────────────────────────────┘        │
│                                                         │
│  ──── Aucun matériel suffisant ? ────                   │
│  │  Utilisez le champ "Commentaire" de la       │        │
│  │  demande pour signaler votre besoin.         │        │
│  │  L'équipe technique sera contactée.          │        │
│  └─────────────────────────────────────────────┘        │
└─────────────────────────────────────────────────────────┘
```

### 3.4 Ecran de sélection d'alternatives

Lorsque l'utilisateur clique sur "Sélectionner pour compléter", un écran de sélection s'affiche :

```
┌─────────────────────────────────────────────────────────┐
│  Compléter la réservation                               │
│  Il vous manque 2 unités pour compléter votre besoin    │
│                                                         │
│  DELL Precision T1700 (3 dispo)     Qté: [2] ▼         │
│  DELL Precision Tower 7920 (2 dispo) Qté: [0] ▼        │
│  DELL Precision T3500 (1 dispo)     Qté: [0] ▼         │
│                                                         │
│  Total sélectionné : 2 / 2 manquantes                   │
│                                                         │
│  [ Réserver le complément ]                             │
└─────────────────────────────────────────────────────────┘
```

### 3.5 Action de réservation

Lorsque l'utilisateur clique sur "Réserver", le widget effectue les opérations suivantes via l'API Monday :

#### Etape 1 : Sélection des équipements individuels
- Parmi les équipements disponibles de la famille demandée, sélectionner N équipements (N = quantité à réserver)
- Critère de sélection : priorité aux équipements du même local de stock, puis par ordre d'ID

#### Etape 2 : Création des lignes de réservation
Pour chaque équipement individuel sélectionné :
- Créer une ligne dans le tableau "Réservations" avec :
  - Equipement individuel = lien vers l'équipement
  - Plage de réservation = dates du sous-élément
  - Demande liée = lien vers le sous-élément de demande
  - Statut = "Pré-réservé"

#### Etape 3 : Mise à jour des équipements individuels
Pour chaque équipement réservé :
- Mettre à jour le statut de l'équipement : "Disponible" → "Réservé"
- Lier la réservation créée dans la colonne "Réservation en cours"

#### Etape 4 : Mise à jour du sous-élément de demande
- Mettre à jour la colonne de connexion vers le catalogue pour refléter le matériel effectivement réservé

#### Etape 5 : Confirmation
- Afficher un message de confirmation avec le récapitulatif :
  - Nombre d'unités réservées
  - Modèle(s) réservé(s)
  - Plage de dates
  - Lien vers les réservations créées

---

## 4. Règles de gestion des statuts

### 4.1 Cycle de vie d'un équipement individuel

```
                    ┌───────────────┐
                    │  Disponible   │
                    └───────┬───────┘
                            │ réservation créée
                            ▼
                    ┌───────────────┐
                    │   Réservé     │
                    └───────┬───────┘
                            │ date début atteinte
                            ▼
                    ┌───────────────┐
                    │    Occupé     │
                    └───────┬───────┘
                            │ date fin atteinte
                            ▼
                    ┌───────────────┐
                    │  Disponible   │ (retour en stock)
                    └───────────────┘

     Hors cycle :
     ┌───────────────┐     ┌───────────────┐
     │ En maintenance │     │ Hors service  │
     └───────────────┘     └───────────────┘
     (non réservable)      (non réservable)
```

### 4.2 Transitions de statut automatiques (via automations Monday)

| Déclencheur | Action |
|-------------|--------|
| Réservation créée avec statut "Pré-réservé" | Equipement → "Réservé" |
| Date début de la plage de réservation atteinte | Réservation → "En cours", Equipement → "Occupé" |
| Date fin de la plage de réservation atteinte | Réservation → "Terminé", Equipement → "Disponible" (si pas d'autre réservation active) |
| Réservation annulée | Equipement → "Disponible" (si pas d'autre réservation active) |

### 4.3 Gestion des réservations multiples sur un même équipement

Un équipement peut avoir **plusieurs réservations futures** sur des plages non chevauchantes. Le statut de l'équipement reflète son état **actuel** :
- Si une réservation est "En cours" → Occupé
- Si des réservations futures existent mais aucune en cours → Réservé
- Si aucune réservation active/future → Disponible

Le calcul de disponibilité du widget vérifie le **chevauchement de plages**, pas le statut instantané de l'équipement.

---

## 5. Gestion des logiciels et licences

### 5.1 Particularités

Les logiciels sont gérés comme du matériel mais avec des spécificités :

- **Licences limitées** : une licence DaVinci Resolve Studio peut équiper 2 postes (→ 2 éléments dans l'inventaire avec le même numéro de série)
- **Plugins audio** : une clé peut porter un nombre illimité de plugins
- **Distinction logiciel vs licence** : le catalogue liste le logiciel, l'inventaire individuel liste les licences disponibles

### 5.2 Catégorisation

Les logiciels utilisent la même structure Famille > Sous-famille > Catégorie :
- Famille : "Logiciels"
- Sous-familles : "Vidéo", "Audio", "Bureautique", etc.
- Catégories : "Licence payante", "Freeware", etc.

### 5.3 Non-substituabilité

Contrairement au matériel, certains logiciels **ne sont pas substituables** (ex: une formation Media Composer ne peut pas utiliser DaVinci Resolve). Le widget propose des alternatives uniquement au sein de la même sous-famille, mais l'utilisateur/agent doit valider la compatibilité pédagogique.

---

## 6. Cas d'erreur et cas limites

### 6.1 Données manquantes sur le sous-élément

| Donnée manquante | Comportement du widget |
|------------------|----------------------|
| Plage de dates | Message : "Veuillez renseigner les dates souhaitées dans le champ Echéances" |
| Famille/type de matériel | Message : "Veuillez sélectionner un type de matériel dans le catalogue" |
| Quantité | Message : "Veuillez indiquer la quantité souhaitée" |
| Toutes les données | Message récapitulatif des champs à remplir |

### 6.2 Conflits de réservation (race condition)

Si entre le moment où l'utilisateur consulte la disponibilité et le moment où il clique "Réserver", un autre utilisateur a réservé les mêmes équipements :
1. Le widget re-vérifie la disponibilité au moment du clic
2. Si le stock a changé, afficher un message : "La disponibilité a changé. X unités sont désormais disponibles."
3. Proposer de réserver la quantité restante

### 6.3 Famille sans équipements individuels

Si une famille d'équipements existe dans le catalogue mais qu'aucun équipement individuel n'y est rattaché :
- Message : "Aucun équipement individuel n'est enregistré pour ce modèle. Contactez l'équipe technique."

### 6.4 Plage de dates dans le passé

- Message : "La plage de dates sélectionnée est dans le passé. Veuillez sélectionner des dates futures."

### 6.5 Réservation déjà existante pour ce sous-élément

Si le sous-élément a déjà des réservations liées :
- Afficher les réservations existantes avec leur statut
- Proposer de modifier ou d'annuler les réservations existantes avant d'en créer de nouvelles

---

## 7. Cas d'indisponibilité totale (workflow manuel)

Lorsque ni le matériel demandé ni aucun équivalent n'est disponible :

1. Le widget affiche un message invitant à utiliser le champ "Commentaire" du formulaire
2. Un workflow Monday est déclenché automatiquement pour notifier l'équipe technique (Charlène / Anne-Sophie)
3. L'équipe technique peut alors :
   - Vérifier si un poste fixe en salle peut être temporairement réaffecté
   - Consulter les plannings de salles et de stagiaires
   - Contacter manuellement le demandeur

Ce cas sort du périmètre du widget et est géré par un workflow Monday classique (automation).

---

## 8. Logique de recherche d'alternatives

### 8.1 Périmètre de recherche

Quand le matériel demandé n'est pas (complètement) disponible, le widget cherche des alternatives dans cet ordre :

1. **Même sous-famille + même catégorie** (ex: autres modèles Desktops Windows)
2. **Même sous-famille, catégorie différente** (ex: All-in-one au lieu de Desktop, mais toujours Ordinateurs)
3. Ne pas élargir au-delà de la sous-famille (la compatibilité n'est plus garantie)

### 8.2 Tri des alternatives

Les alternatives sont triées par :
1. Nombre d'unités disponibles (décroissant) — proposer d'abord les modèles qui peuvent couvrir le besoin
2. Même système d'exploitation en priorité
3. Nom alphabétique en cas d'égalité

### 8.3 Filtrage

Exclure des alternatives :
- Les équipements avec statut global "Hors service" ou "Pas en stock"
- Les équipements non réservables (checkbox réservable = false)

---

## 9. Appels API Monday.com

### 9.1 Lecture des données (queries GraphQL)

Le widget utilise les queries suivantes :

**Récupérer le contexte du sous-élément :**
```graphql
query {
  items(ids: [$subitemId]) {
    id
    name
    column_values {
      id
      text
      value
    }
    parent_item {
      id
      name
    }
  }
}
```

**Récupérer les équipements individuels d'une famille :**
```graphql
query {
  items_page_by_column_values(
    board_id: $equipementsIndividuelsBoard
    columns: [{ column_id: "connexion_famille", column_values: [$familleItemId] }]
  ) {
    items {
      id
      name
      column_values {
        id
        text
        value
      }
    }
  }
}
```

**Récupérer les réservations chevauchantes :**
```graphql
query {
  items_page_by_column_values(
    board_id: $reservationsBoard
    columns: [{ column_id: "connexion_equipement", column_values: [$equipementIds] }]
  ) {
    items {
      id
      column_values {
        id
        text
        value
      }
    }
  }
}
```

### 9.2 Mutations (création de réservations)

**Créer une réservation :**
```graphql
mutation {
  create_item(
    board_id: $reservationsBoard
    item_name: "Résa - [NomEquipement] - [DateDébut]"
    column_values: "{
      \"connexion_equipement\": {\"item_ids\": [$equipementId]},
      \"plage_reservation\": {\"from\": \"$dateDebut\", \"to\": \"$dateFin\"},
      \"connexion_demande\": {\"item_ids\": [$subitemId]},
      \"statut\": {\"label\": \"Pré-réservé\"}
    }"
  ) {
    id
  }
}
```

**Mettre à jour le statut d'un équipement :**
```graphql
mutation {
  change_column_value(
    board_id: $equipementsIndividuelsBoard
    item_id: $equipementId
    column_id: "statut"
    value: "{\"label\": \"Réservé\"}"
  ) {
    id
  }
}
```

---

## 10. Configuration du widget

Le widget nécessite une configuration initiale (Settings panel Monday) pour mapper les IDs de tableaux et de colonnes :

| Paramètre | Description |
|-----------|-------------|
| Board ID - Familles d'équipements | ID du tableau catalogue |
| Board ID - Equipements individuels | ID du tableau inventaire |
| Board ID - Réservations | ID du tableau réservations |
| Column ID - Plage de dates (sous-élément) | ID de la colonne Echéances |
| Column ID - Quantité requise (sous-élément) | ID de la colonne quantité |
| Column ID - Connexion catalogue (sous-élément) | ID de la colonne de lien vers le catalogue |
| Column ID - Statut (équipement individuel) | ID de la colonne statut |
| Column ID - Connexion famille (équipement individuel) | ID de la colonne de lien vers la famille |
| Column ID - Réservable (équipement individuel) | ID de la colonne checkbox |
| Column ID - Plage de réservation (réservation) | ID de la colonne de dates |
| Column ID - Statut (réservation) | ID de la colonne statut |
| Column ID - Connexion équipement (réservation) | ID du lien vers l'équipement |
| Column ID - Connexion demande (réservation) | ID du lien vers la demande |

---

## 11. Périmètre V1 vs Evolutions futures

### V1 (Septembre 2026 - Livraison INA)

- Widget Item View sur les sous-éléments de demande
- Calcul de disponibilité par plage de dates
- Réservation automatique (création des lignes)
- Proposition d'alternatives (même sous-famille)
- Gestion des cas d'erreur (données manquantes, conflits)
- Configuration par settings panel

### V2 (Post-livraison - Marketplace)

- Vue Board View pour un dashboard de stock global
- Calendrier visuel des réservations par équipement
- Gestion des retours (check-in / check-out)
- Alertes automatiques avant expiration des réservations
- Gestion avancée des licences (alertes de renouvellement, compteur d'activations)
- Intégration CRM (récupération du nombre de stagiaires depuis Dynamics/Proscope)
- Export de rapports d'utilisation du stock
- Historique des réservations par équipement

---

## 12. Contraintes techniques

### 12.1 Limites API Monday.com
- Rate limiting : 5 000 000 complexity points / minute (plan Enterprise)
- Pagination : les requêtes items_page retournent max 500 items par page
- Le widget doit gérer la pagination pour les grands inventaires (~600 équipements)

### 12.2 Performance
- Le calcul de disponibilité doit s'exécuter en < 3 secondes pour un inventaire de 600 équipements
- Mettre en cache les données de famille/sous-famille (changent rarement)
- Ne recharger les réservations que pour la plage de dates concernée

### 12.3 Permissions Monday
- Le widget nécessite les scopes : `boards:read`, `boards:write`, `updates:read`, `updates:write`
- L'utilisateur doit avoir les droits d'écriture sur les tableaux Réservations et Equipements individuels

---

## Annexes

### A. Glossaire

| Terme | Définition |
|-------|-----------|
| LS (Local de Stock) | Zone de stockage contenant le matériel réservable |
| SC (Salle de Cours) | Salle de formation avec matériel fixe non réservable |
| Famille | Catégorie principale (Matériel Informatique, Audiovisuel, Logiciels) |
| Sous-famille | Sous-catégorie (Ordinateurs, Ecrans, Adaptateurs, etc.) |
| Catégorie | Niveau de détail fin (Desktops, Laptops, All-in-one, etc.) |
| Plage de dates | Période [date début, date fin] pour une réservation |
| Chevauchement | Deux plages se chevauchent si début_A <= fin_B ET fin_A >= début_B |

### B. Exemples de familles/sous-familles (données INA)

| Famille | Sous-famille | Exemples de catégories |
|---------|-------------|----------------------|
| Matériel Informatique | Ordinateurs | Desktops, Laptops, All-in-one |
| Matériel Informatique | Ecrans | 22", 24", 32" |
| Matériel Informatique | Adaptateurs / Dock | Adapt. informatique, Dock/Station d'accueil |
| Matériel Informatique | Téléphones | Smartphones, Téléphones fixes |
| Logiciels | Vidéo | DaVinci Resolve, Media Composer, Premiere Pro |
| Logiciels | Audio | Pro Tools, plugins audio |
| Logiciels | Bureautique | Suite Office, etc. |
