#!/bin/bash

# Script de test complet pour l'application Timer
# Teste toutes les routes API et fonctionnalités

API_URL="http://localhost:3000/api"
ADMIN_TOKEN=""
EMPLOYEE_TOKEN=""
TEST_EMPLOYEE_ID=""
TEST_TASK_ID=""
TEST_PROJECT_ID=""
TEST_ENTRY_ID=""

# Couleurs pour l'affichage
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}════════════════════════════════════════════${NC}"
echo -e "${BLUE}   TEST COMPLET APPLICATION TIMER${NC}"
echo -e "${BLUE}════════════════════════════════════════════${NC}\n"

# Fonction pour afficher les résultats
test_result() {
    local name=$1
    local status=$2
    local response=$3
    
    if [ $status -eq 0 ]; then
        echo -e "${GREEN}✅ $name${NC}"
        echo -e "   Réponse: $response\n"
    else
        echo -e "${RED}❌ $name${NC}"
        echo -e "   Erreur: $response\n"
    fi
}

# ============================================
# 1. TEST AUTHENTIFICATION
# ============================================
echo -e "${YELLOW}═══ 1. TESTS AUTHENTIFICATION ═══${NC}\n"

# Test login admin
echo "Test 1.1: Login Admin..."
ADMIN_RESPONSE=$(curl -s -X POST "$API_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@entreprise.fr",
    "password": "admin123"
  }')

if echo "$ADMIN_RESPONSE" | grep -q "token"; then
    ADMIN_TOKEN=$(echo "$ADMIN_RESPONSE" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
    test_result "Login Admin" 0 "Token obtenu: ${ADMIN_TOKEN:0:20}..."
else
    test_result "Login Admin" 1 "$ADMIN_RESPONSE"
    exit 1
fi

# Test login employé
echo "Test 1.2: Login Employé..."
EMPLOYEE_RESPONSE=$(curl -s -X POST "$API_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "jean.dupont@entreprise.fr",
    "password": "password123"
  }')

if echo "$EMPLOYEE_RESPONSE" | grep -q "token"; then
    EMPLOYEE_TOKEN=$(echo "$EMPLOYEE_RESPONSE" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
    test_result "Login Employé" 0 "Token obtenu: ${EMPLOYEE_TOKEN:0:20}..."
else
    test_result "Login Employé" 1 "$EMPLOYEE_RESPONSE"
fi

# Test vérification token
echo "Test 1.3: Vérification Token Admin..."
VERIFY_RESPONSE=$(curl -s -X GET "$API_URL/auth/verify" \
  -H "Authorization: Bearer $ADMIN_TOKEN")
test_result "Vérification Token" $? "$VERIFY_RESPONSE"

# Test login avec mauvais mot de passe
echo "Test 1.4: Login avec mauvais mot de passe..."
BAD_LOGIN=$(curl -s -X POST "$API_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@entreprise.fr",
    "password": "wrongpassword"
  }')
if echo "$BAD_LOGIN" | grep -q "error"; then
    test_result "Rejet mauvais mot de passe" 0 "Erreur correctement retournée"
else
    test_result "Rejet mauvais mot de passe" 1 "Devrait retourner une erreur"
fi

# ============================================
# 2. TEST GESTION EMPLOYÉS (ADMIN)
# ============================================
echo -e "${YELLOW}═══ 2. TESTS GESTION EMPLOYÉS ═══${NC}\n"

# Test création employé
echo "Test 2.1: Création Employé..."
CREATE_EMPLOYEE=$(curl -s -X POST "$API_URL/admin/employees" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{
    "first_name": "Test",
    "last_name": "Employee",
    "email": "test.employee@test.fr",
    "password": "test123",
    "position": "Testeur"
  }')

if echo "$CREATE_EMPLOYEE" | grep -q "user_id"; then
    TEST_EMPLOYEE_ID=$(echo "$CREATE_EMPLOYEE" | grep -o '"user_id":[0-9]*' | cut -d':' -f2)
    test_result "Création Employé" 0 "ID: $TEST_EMPLOYEE_ID"
else
    test_result "Création Employé" 1 "$CREATE_EMPLOYEE"
fi

# Test liste employés
echo "Test 2.2: Liste Employés..."
LIST_EMPLOYEES=$(curl -s -X GET "$API_URL/admin/employees" \
  -H "Authorization: Bearer $ADMIN_TOKEN")
test_result "Liste Employés" $? "$(echo $LIST_EMPLOYEES | head -c 100)..."

# Test suppression employé
if [ ! -z "$TEST_EMPLOYEE_ID" ]; then
    echo "Test 2.3: Suppression Employé..."
    DELETE_EMPLOYEE=$(curl -s -X DELETE "$API_URL/admin/employees/$TEST_EMPLOYEE_ID" \
      -H "Authorization: Bearer $ADMIN_TOKEN")
    test_result "Suppression Employé" $? "$DELETE_EMPLOYEE"
    
    # Vérifier que l'employé est bien supprimé
    echo "Test 2.4: Vérification Suppression..."
    CHECK_DELETE=$(curl -s -X GET "$API_URL/admin/employees" \
      -H "Authorization: Bearer $ADMIN_TOKEN")
    if echo "$CHECK_DELETE" | grep -q "$TEST_EMPLOYEE_ID"; then
        test_result "Vérification Suppression" 1 "L'employé existe encore!"
    else
        test_result "Vérification Suppression" 0 "Employé bien supprimé"
    fi
fi

# ============================================
# 3. TEST GESTION TÂCHES
# ============================================
echo -e "${YELLOW}═══ 3. TESTS GESTION TÂCHES ═══${NC}\n"

# Test création tâche
echo "Test 3.1: Création Tâche..."
CREATE_TASK=$(curl -s -X POST "$API_URL/admin/tasks" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{
    "name": "Tâche de Test",
    "description": "Description test"
  }')

if echo "$CREATE_TASK" | grep -q "task_id"; then
    TEST_TASK_ID=$(echo "$CREATE_TASK" | grep -o '"task_id":[0-9]*' | cut -d':' -f2)
    test_result "Création Tâche" 0 "ID: $TEST_TASK_ID"
else
    test_result "Création Tâche" 1 "$CREATE_TASK"
fi

# Test liste tâches
echo "Test 3.2: Liste Tâches..."
LIST_TASKS=$(curl -s -X GET "$API_URL/tasks" \
  -H "Authorization: Bearer $EMPLOYEE_TOKEN")
test_result "Liste Tâches" $? "$(echo $LIST_TASKS | head -c 100)..."

# Test suppression tâche
if [ ! -z "$TEST_TASK_ID" ]; then
    echo "Test 3.3: Suppression Tâche..."
    DELETE_TASK=$(curl -s -X DELETE "$API_URL/admin/tasks/$TEST_TASK_ID" \
      -H "Authorization: Bearer $ADMIN_TOKEN")
    test_result "Suppression Tâche" $? "$DELETE_TASK"
fi

# ============================================
# 4. TEST GESTION PROJETS
# ============================================
echo -e "${YELLOW}═══ 4. TESTS GESTION PROJETS ═══${NC}\n"

# Test création projet
echo "Test 4.1: Création Projet..."
CREATE_PROJECT=$(curl -s -X POST "$API_URL/admin/projects" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{
    "name": "Projet Test",
    "description": "Description projet test",
    "client": "Client Test"
  }')

if echo "$CREATE_PROJECT" | grep -q "project_id"; then
    TEST_PROJECT_ID=$(echo "$CREATE_PROJECT" | grep -o '"project_id":[0-9]*' | cut -d':' -f2)
    test_result "Création Projet" 0 "ID: $TEST_PROJECT_ID"
else
    test_result "Création Projet" 1 "$CREATE_PROJECT"
fi

# Test liste projets
echo "Test 4.2: Liste Projets..."
LIST_PROJECTS=$(curl -s -X GET "$API_URL/projects" \
  -H "Authorization: Bearer $EMPLOYEE_TOKEN")
test_result "Liste Projets" $? "$(echo $LIST_PROJECTS | head -c 100)..."

# Test suppression projet
if [ ! -z "$TEST_PROJECT_ID" ]; then
    echo "Test 4.3: Suppression Projet..."
    DELETE_PROJECT=$(curl -s -X DELETE "$API_URL/admin/projects/$TEST_PROJECT_ID" \
      -H "Authorization: Bearer $ADMIN_TOKEN")
    test_result "Suppression Projet" $? "$DELETE_PROJECT"
fi

# ============================================
# 5. TEST SESSIONS DE TRAVAIL
# ============================================
echo -e "${YELLOW}═══ 5. TESTS SESSIONS DE TRAVAIL ═══${NC}\n"

# Test récupération session du jour
echo "Test 5.1: Session du Jour..."
TODAY_SESSION=$(curl -s -X GET "$API_URL/work-sessions/today" \
  -H "Authorization: Bearer $EMPLOYEE_TOKEN")
test_result "Session du Jour" $? "$TODAY_SESSION"

# Test mise à jour session
echo "Test 5.2: Mise à jour Session..."
UPDATE_SESSION=$(curl -s -X POST "$API_URL/work-sessions/update" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $EMPLOYEE_TOKEN" \
  -d '{
    "work_seconds": 3600,
    "break_seconds": 600,
    "lunch_seconds": 1800
  }')
test_result "Mise à jour Session" $? "$UPDATE_SESSION"

# ============================================
# 6. TEST TIME ENTRIES
# ============================================
echo -e "${YELLOW}═══ 6. TESTS TIME ENTRIES ═══${NC}\n"

# Créer une tâche pour le test
CREATE_TASK_FOR_ENTRY=$(curl -s -X POST "$API_URL/admin/tasks" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{
    "name": "Tâche pour Time Entry",
    "description": "Test"
  }')
TASK_FOR_ENTRY_ID=$(echo "$CREATE_TASK_FOR_ENTRY" | grep -o '"task_id":[0-9]*' | cut -d':' -f2)

# Test démarrage time entry
echo "Test 6.1: Démarrage Time Entry..."
START_ENTRY=$(curl -s -X POST "$API_URL/time-entries/start" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $EMPLOYEE_TOKEN" \
  -d "{
    \"task_id\": $TASK_FOR_ENTRY_ID,
    \"project_id\": null
  }")

if echo "$START_ENTRY" | grep -q "entry_id"; then
    TEST_ENTRY_ID=$(echo "$START_ENTRY" | grep -o '"entry_id":[0-9]*' | cut -d':' -f2)
    test_result "Démarrage Time Entry" 0 "ID: $TEST_ENTRY_ID"
else
    test_result "Démarrage Time Entry" 1 "$START_ENTRY"
fi

# Test mise à jour time entry
if [ ! -z "$TEST_ENTRY_ID" ]; then
    echo "Test 6.2: Mise à jour Time Entry..."
    UPDATE_ENTRY=$(curl -s -X PUT "$API_URL/time-entries/$TEST_ENTRY_ID" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer $EMPLOYEE_TOKEN" \
      -d '{
        "duration_seconds": 1200
      }')
    test_result "Mise à jour Time Entry" $? "$UPDATE_ENTRY"
fi

# Test historique
echo "Test 6.3: Historique Time Entries..."
HISTORY=$(curl -s -X GET "$API_URL/time-entries/history" \
  -H "Authorization: Bearer $EMPLOYEE_TOKEN")
test_result "Historique" $? "$(echo $HISTORY | head -c 100)..."

# ============================================
# 7. TEST STATISTIQUES ADMIN
# ============================================
echo -e "${YELLOW}═══ 7. TESTS STATISTIQUES ADMIN ═══${NC}\n"

# Test stats globales
echo "Test 7.1: Stats Globales..."
GLOBAL_STATS=$(curl -s -X GET "$API_URL/admin/stats/global" \
  -H "Authorization: Bearer $ADMIN_TOKEN")
test_result "Stats Globales" $? "$GLOBAL_STATS"

# Test stats employés
echo "Test 7.2: Stats Employés..."
EMPLOYEE_STATS=$(curl -s -X GET "$API_URL/admin/stats/employees" \
  -H "Authorization: Bearer $ADMIN_TOKEN")
test_result "Stats Employés" $? "$(echo $EMPLOYEE_STATS | head -c 100)..."

# Test activité récente
echo "Test 7.3: Activité Récente..."
RECENT_ACTIVITY=$(curl -s -X GET "$API_URL/admin/activity/recent" \
  -H "Authorization: Bearer $ADMIN_TOKEN")
test_result "Activité Récente" $? "$(echo $RECENT_ACTIVITY | head -c 100)..."

# ============================================
# 8. TEST SÉCURITÉ
# ============================================
echo -e "${YELLOW}═══ 8. TESTS SÉCURITÉ ═══${NC}\n"

# Test accès admin avec token employé
echo "Test 8.1: Employé tente accès Admin..."
UNAUTHORIZED=$(curl -s -X GET "$API_URL/admin/employees" \
  -H "Authorization: Bearer $EMPLOYEE_TOKEN")
if echo "$UNAUTHORIZED" | grep -q "refusé\|forbidden\|Accès refusé"; then
    test_result "Blocage accès non autorisé" 0 "Accès correctement refusé"
else
    test_result "Blocage accès non autorisé" 1 "FAILLE SÉCURITÉ: Accès autorisé!"
fi

# Test sans token
echo "Test 8.2: Requête sans token..."
NO_TOKEN=$(curl -s -X GET "$API_URL/work-sessions/today")
if echo "$NO_TOKEN" | grep -q "manquant\|missing\|Token"; then
    test_result "Rejet sans token" 0 "Token requis correctement"
else
    test_result "Rejet sans token" 1 "FAILLE SÉCURITÉ: Accès sans token!"
fi

# ============================================
# RÉSUMÉ
# ============================================
echo -e "\n${BLUE}════════════════════════════════════════════${NC}"
echo -e "${BLUE}   FIN DES TESTS${NC}"
echo -e "${BLUE}════════════════════════════════════════════${NC}\n"

echo -e "${GREEN}Tests terminés !${NC}"
echo -e "Vérifiez les résultats ci-dessus.\n"
