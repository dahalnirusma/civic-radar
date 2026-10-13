import postgres from 'postgres'
const databaseURL = process.env.DATABASE_URL
if (!databaseURL) {
    throw new Error('Invalid Database Url')
}

export const sql = postgres(databaseURL, {
    ssl: 'require',
    prepare: false, 
    max: 5,         
    idle_timeout: 20,
})