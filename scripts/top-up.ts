import Database from 'better-sqlite3';

const db = new Database('delta.db');

try {
    const stmt = db.prepare("UPDATE users SET del_balance = 10000000 WHERE id = 'test-user-id'");
    const info = stmt.run();
    console.log('💰 Top up successful:', info.changes);
} catch (err) {
    console.error('Failed:', err);
}
