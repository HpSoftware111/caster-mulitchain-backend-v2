n development

npm run dev

In production

npm run build

npm start

--Notes-- Update types: npx supabase gen types typescript --project-id "tjzdymvhmoesumvjcyqk" --schema public > src/types/supabase.ts

please follow below commands.

Backend

npm run build
pm2 start "npm start" --name backend if need to restart pm2 restart backend if need to stop pm2 stop backend
Bot pm2 start "npm start" --name tgbot if need to restart pm2 restart tgbot if need to stop pm2 stop tgbot

Jupiter stuff

pm2 list pm2 stop 1 pm2 stop 2 pm2 delete 0 pm2 start "RUST_LOG=info ./jupiter-swap-api --rpc-url https://floral-white-darkness.solana-mainnet.quiknode.pro/55d17aa4ea3835994df4ed4f23bb98f8095b34a4/ --dex-program-ids "LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo","CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK","675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8","CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C","Eo7WjKq67rjJQSZxS6z3YkapzY3eMj6Xy8X5EQVn5UaB" --enable-add-market" --name Jupiter pm2 start 1 pm2 start 2 pm2 list