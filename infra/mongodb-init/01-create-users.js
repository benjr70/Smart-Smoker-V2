// MongoDB User Initialization Script
// This script runs automatically when MongoDB container starts for the first time
// It creates the admin user and application user with appropriate permissions

db = db.getSiblingDB('admin');

// Create admin user with root privileges
db.createUser({
  user: process.env.MONGO_INITDB_ROOT_USERNAME,
  pwd: process.env.MONGO_INITDB_ROOT_PASSWORD,
  roles: ['root']
});

print('✅ Admin user created successfully');

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
print('MongoDB initialization complete');
