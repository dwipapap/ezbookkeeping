package datastore

import (
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/mayswind/ezbookkeeping/pkg/settings"
)

func TestGetMysqlConnectionString_TCP(t *testing.T) {
	expectedValue := "username:password@tcp(1.2.3.4:3306)/dbname?charset=utf8mb4&parseTime=true"
	actualValue, err := getMysqlConnectionString(&settings.DatabaseConfig{
		DatabaseType:     "mysql",
		DatabaseHost:     "1.2.3.4:3306",
		DatabaseName:     "dbname",
		DatabaseUser:     "username",
		DatabasePassword: "password",
	})

	assert.Nil(t, err)
	assert.Equal(t, expectedValue, actualValue)
}

func TestGetMysqlConnectionString_UnixSocket(t *testing.T) {
	expectedValue := "username:password@unix(/path/to/mysql.sock)/dbname?charset=utf8mb4&parseTime=true"
	actualValue, err := getMysqlConnectionString(&settings.DatabaseConfig{
		DatabaseType:     "mysql",
		DatabaseHost:     "/path/to/mysql.sock",
		DatabaseName:     "dbname",
		DatabaseUser:     "username",
		DatabasePassword: "password",
	})

	assert.Nil(t, err)
	assert.Equal(t, expectedValue, actualValue)
}

func TestGetPostgreSQLConnectionString_TCP(t *testing.T) {
	expectedValue := "postgres://username:password@1.2.3.4:5432/dbname?sslmode=disable"
	actualValue, err := getPostgresConnectionString(&settings.DatabaseConfig{
		DatabaseType:     "postgres",
		DatabaseHost:     "1.2.3.4:5432",
		DatabaseName:     "dbname",
		DatabaseUser:     "username",
		DatabasePassword: "password",
		DatabaseSSLMode:  "disable",
	})

	assert.Nil(t, err)
	assert.Equal(t, expectedValue, actualValue)
}

func TestGetPostgreSQLConnectionString_UnixSocket(t *testing.T) {
	expectedValue := "postgres:///dbname?sslmode=disable&host=/path/to/postgres.sock&user=username&password=password"
	actualValue, err := getPostgresConnectionString(&settings.DatabaseConfig{
		DatabaseType:     "postgres",
		DatabaseHost:     "/path/to/postgres.sock",
		DatabaseName:     "dbname",
		DatabaseUser:     "username",
		DatabasePassword: "password",
		DatabaseSSLMode:  "disable",
	})

	assert.Nil(t, err)
	assert.Equal(t, expectedValue, actualValue)
}

func TestGetSqlite3ConnectionString(t *testing.T) {
	expectedValue := "file:/path/to/ezbookkeeping.db?cache=shared&mode=rwc&_journal_mode=WAL&_busy_timeout=5000&_synchronous=NORMAL&_cache_size=-16000&_temp_store=MEMORY"
	actualValue, err := getSqlite3ConnectionString(&settings.DatabaseConfig{
		DatabaseType: settings.Sqlite3DbType,
		DatabasePath: "/path/to/ezbookkeeping.db",
	})

	assert.Nil(t, err)
	assert.Equal(t, expectedValue, actualValue)
}

type closeTrackingDatabase struct {
	Database
	closeCount int
}

func (db *closeTrackingDatabase) Close() error {
	db.closeCount++
	return nil
}

func TestDataStoreContainer_CloseDeduplicatesDatabases(t *testing.T) {
	sharedDB := &closeTrackingDatabase{}

	userStore, err := NewDataStore(sharedDB)
	assert.Nil(t, err)
	tokenStore, err := NewDataStore(sharedDB)
	assert.Nil(t, err)
	userDataStore, err := NewDataStore(sharedDB)
	assert.Nil(t, err)

	container := &DataStoreContainer{
		UserStore:     userStore,
		TokenStore:    tokenStore,
		UserDataStore: userDataStore,
	}

	err = container.Close()
	assert.Nil(t, err)
	assert.Equal(t, 1, sharedDB.closeCount)
}
