#!/usr/bin/env -S node --enable-source-maps
import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite/vector';

async function main(){
  const db = await PGlite.create({ dataDir: 'pglite_data', relaxedDurability: true, extensions: { vector } });
  try{
    const res = await db.query("SELECT count(*) AS count FROM knowledge");
    console.log('knowledge rows:', (res.rows[0] as { count: string }).count);
    const catRes = await db.query("SELECT category, count(*) as cnt FROM knowledge GROUP BY category ORDER BY cnt DESC");
    console.log('by category:');
    console.table(catRes.rows);
  }catch(e: any){
    console.error('Query failed:', e.message);
  }
  process.exit(0);
}

main().catch(e=>{console.error(e); process.exit(1)});
