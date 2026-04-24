use std::path::PathBuf;
use rusqlite::{Connection, params};
use tauri::{AppHandle, Manager};
use serde_json::{json, Value};

fn app_data_dir(app: &AppHandle) -> PathBuf {
    app.path().app_data_dir().expect("failed to get app data dir")
}

fn open_unified(app: &AppHandle) -> Result<Connection, String> {
    let app_data = app_data_dir(app);
    let main_db = app_data.join("hujjah-quran.db");
    let conn = Connection::open(&main_db).map_err(|e| e.to_string())?;

    conn.execute_batch(
        "PRAGMA journal_mode = WAL;\nPRAGMA synchronous = NORMAL;\nPRAGMA mmap_size = 268435456;"
    ).map_err(|e| e.to_string())?;

    let core_db = app_data.join("hujjah-hadith-core.db");
    if core_db.exists() {
        let sql = format!("ATTACH DATABASE '{}' AS core", core_db.to_string_lossy());
        conn.execute(&sql, []).map_err(|e| e.to_string())?;
    }

    let research_db = app_data.join("hujjah-hadith-research.db");
    if research_db.exists() {
        let sql = format!("ATTACH DATABASE '{}' AS research", research_db.to_string_lossy());
        conn.execute(&sql, []).map_err(|e| e.to_string())?;
    }

    Ok(conn)
}

#[tauri::command]
pub async fn initialize_unified_connection(app: AppHandle) -> Result<Value, String> {
    let app_data = app_data_dir(&app);
    let tiers = json!({
        "quran": true,
        "core": app_data.join("hujjah-hadith-core.db").exists(),
        "research": app_data.join("hujjah-hadith-research.db").exists(),
    });
    let conn = open_unified(&app)?;
    let mut stmt = conn.prepare("PRAGMA database_list").map_err(|e| e.to_string())?;
    let dbs: Vec<String> = stmt
        .query_map([], |row| row.get(1))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(json!({ "tiers": tiers, "attached": dbs }))
}

#[tauri::command]
pub async fn global_search(app: AppHandle, query: String, lang: String, limit: i64) -> Result<Value, String> {
    let conn = open_unified(&app)?;
    let q = query.trim();
    if q.is_empty() {
        return Ok(json!({"results": []}));
    }
    let mut results = Vec::new();

    // Tier 1: Quran (weight 1.0)
    let quran_sql = format!(
        "SELECT 'quran' as tier, v.surah, v.ayah, s.name_en as surah_name, \
         v.text_ar, t.text as translation, t.translator_slug, \
         bm25(quran_search_idx) as raw_rank, 1.0 as weight \
         FROM quran_search_idx \
         JOIN translations t ON t.id = quran_search_idx.rowid \
         JOIN verses v ON v.id = t.verse_id \
         JOIN surahs s ON s.id = v.surah \
         WHERE quran_search_idx MATCH ? AND quran_search_idx.lang_code = ? \
         ORDER BY bm25(quran_search_idx) LIMIT {}",
        limit
    );
    {
        let mut stmt = conn.prepare(&quran_sql).map_err(|e| e.to_string())?;
        let rows = stmt.query_map(params![&q, &lang], |row| {
            Ok(json!({
                "tier": row.get::<_, String>(0)?,
                "surah": row.get::<_, i64>(1)?,
                "ayah": row.get::<_, i64>(2)?,
                "surah_name": row.get::<_, String>(3)?,
                "text_ar": row.get::<_, String>(4)?,
                "text": row.get::<_, String>(5)?,
                "translator": row.get::<_, String>(6)?,
                "raw_rank": row.get::<_, f64>(7)?,
                "weight": row.get::<_, f64>(8)?
            }))
        }).map_err(|e| e.to_string())?;
        for row in rows.flatten() {
            results.push(row);
        }
    }

    // Tier 2: Core Hadith (weight 0.8)
    if app_data_dir(&app).join("hujjah-hadith-core.db").exists() {
        let core_sql = format!(
            "SELECT 'hadith-core' as tier, h.id, b.name_ar as book_name, \
             b.name_en as book_name_en, h.num_in_book, h.matn_ar, \
             bm25(core.hadith_search_idx) as raw_rank, 0.8 as weight \
             FROM core.hadith_search_idx \
             JOIN core.hadiths h ON h.id = core.hadith_search_idx.rowid \
             JOIN core.hadith_books b ON b.id = h.book_id \
             WHERE core.hadith_search_idx MATCH ? \
             ORDER BY bm25(core.hadith_search_idx) LIMIT {}",
            limit
        );
        let mut stmt = conn.prepare(&core_sql).map_err(|e| e.to_string())?;
        let rows = stmt.query_map(params![&q], |row| {
            Ok(json!({
                "tier": row.get::<_, String>(0)?,
                "id": row.get::<_, i64>(1)?,
                "book_name": row.get::<_, String>(2)?,
                "book_name_en": row.get::<_, Option<String>>(3)?,
                "num_in_book": row.get::<_, i64>(4)?,
                "matn_ar": row.get::<_, String>(5)?,
                "raw_rank": row.get::<_, f64>(6)?,
                "weight": row.get::<_, f64>(7)?
            }))
        }).map_err(|e| e.to_string())?;
        for row in rows.flatten() {
            results.push(row);
        }
    }

    // Tier 3: Research Hadith (weight 0.5)
    if app_data_dir(&app).join("hujjah-hadith-research.db").exists() {
        let research_sql = format!(
            "SELECT 'hadith-research' as tier, h.id, b.name_ar as book_name, \
             b.name_en as book_name_en, h.num_in_book, h.matn_ar, \
             bm25(research.hadith_search_idx) as raw_rank, 0.5 as weight \
             FROM research.hadith_search_idx \
             JOIN research.hadiths h ON h.id = research.hadith_search_idx.rowid \
             JOIN research.hadith_books b ON b.id = h.book_id \
             WHERE research.hadith_search_idx MATCH ? \
             ORDER BY bm25(research.hadith_search_idx) LIMIT {}",
            limit
        );
        let mut stmt = conn.prepare(&research_sql).map_err(|e| e.to_string())?;
        let rows = stmt.query_map(params![&q], |row| {
            Ok(json!({
                "tier": row.get::<_, String>(0)?,
                "id": row.get::<_, i64>(1)?,
                "book_name": row.get::<_, String>(2)?,
                "book_name_en": row.get::<_, Option<String>>(3)?,
                "num_in_book": row.get::<_, i64>(4)?,
                "matn_ar": row.get::<_, String>(5)?,
                "raw_rank": row.get::<_, f64>(6)?,
                "weight": row.get::<_, f64>(7)?
            }))
        }).map_err(|e| e.to_string())?;
        for row in rows.flatten() {
            results.push(row);
        }
    }

    // Sort by weighted rank (raw_rank * weight)
    results.sort_by(|a, b| {
        let rank_a = a.get("raw_rank").and_then(|v| v.as_f64()).unwrap_or(999.0) * a.get("weight").and_then(|v| v.as_f64()).unwrap_or(1.0);
        let rank_b = b.get("raw_rank").and_then(|v| v.as_f64()).unwrap_or(999.0) * b.get("weight").and_then(|v| v.as_f64()).unwrap_or(1.0);
        rank_a.partial_cmp(&rank_b).unwrap_or(std::cmp::Ordering::Equal)
    });

    Ok(json!({ "results": results }))
}

#[tauri::command]
pub async fn get_sanad_graph(app: AppHandle, hadith_id: i64) -> Result<Value, String> {
    let conn = open_unified(&app)?;

    // Check which DB has this hadith
    let mut found_tier = String::from("core");
    let mut found_id = hadith_id;

    // Try core first, then research
    let check_sql = "SELECT h.id, 'core' as tier FROM core.hadiths h WHERE h.id = ? UNION ALL SELECT h.id, 'research' as tier FROM research.hadiths h WHERE h.id = ?";
    let mut stmt = conn.prepare(check_sql).map_err(|e| e.to_string())?;
    let row_opt = stmt.query_row(params![hadith_id, hadith_id], |row| {
        let id: i64 = row.get(0)?;
        let tier: String = row.get(1)?;
        Ok((id, tier))
    });

    if let Ok((id, tier)) = row_opt {
        found_id = id;
        found_tier = tier;
    }

    // Recursive CTE: traverse sanad chain
    let recurse_sql = format!(
        "WITH RECURSIVE chain(idx, narrator_id, position, hadith_id) AS ( \
            SELECT 0, hn.narrator_id, hn.position, hn.hadith_id \
            FROM {}.hadith_narrators hn WHERE hn.hadith_id = ? \
            UNION ALL \
            SELECT c.idx + 1, hn2.narrator_id, hn2.position, hn2.hadith_id \
            FROM chain c \
            JOIN {}.hadith_narrators hn2 ON hn2.hadith_id = c.hadith_id AND hn2.position = c.position + 1 \
        ) \
        SELECT c.idx, n.name_ar, c.position \
        FROM chain c \
        JOIN {}.narrators n ON n.id = c.narrator_id \
        ORDER BY c.idx",
        found_tier, found_tier, found_tier
    );

    let mut stmt = conn.prepare(&recurse_sql).map_err(|e| e.to_string())?;
    let nodes: Vec<Value> = stmt.query_map(params![found_id], |row| {
        Ok(json!({
            "index": row.get::<_, i64>(0)?,
            "name_ar": row.get::<_, String>(1)?,
            "position": row.get::<_, i64>(2)?
        }))
    }).map_err(|e| e.to_string())?
    .filter_map(|r| r.ok())
    .collect();

    Ok(json!({
        "hadith_id": hadith_id,
        "tier": found_tier,
        "chain": nodes
    }))
}