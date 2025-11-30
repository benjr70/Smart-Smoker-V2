// MongoDB User Initialization Script
// This script runs automatically when MongoDB container starts for the first time
// Note: MongoDB automatically creates the admin user from MONGO_INITDB_ROOT_USERNAME/PASSWORD
// This script only creates the application user with limited permissions

db = db.getSiblingDB('admin');

print('ℹ️  Admin user already created by MongoDB from environment variables');

// Create application user with limited permissions (readWrite only on smartsmoker database)
db.createUser({
  user: 'smartsmoker',
  pwd: process.env.MONGO_APP_PASSWORD,
  roles: [
    {
      role: 'readWrite',
      db: 'smartsmoker'
    }
  ]
});

print('✅ Application user "smartsmoker" created successfully');
print('✅ MongoDB initialization complete');
