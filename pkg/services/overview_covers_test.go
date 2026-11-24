package services

import (
	"bytes"
	"io"
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/mayswind/ezbookkeeping/pkg/core"
	"github.com/mayswind/ezbookkeeping/pkg/settings"
	"github.com/mayswind/ezbookkeeping/pkg/storage"
)

type memoryMultipartFile struct {
	*bytes.Reader
}

func (m *memoryMultipartFile) Close() error {
	return nil
}

func TestIsValidOverviewCoverFileName(t *testing.T) {
	assert.True(t, IsValidOverviewCoverFileName("0123456789abcdef0123456789abcdef.webp"))
	assert.True(t, IsValidOverviewCoverFileName("abcdef0123456789abcdef0123456789.jpg"))
	assert.False(t, IsValidOverviewCoverFileName("../secret.png"))
	assert.False(t, IsValidOverviewCoverFileName("short.png"))
	assert.False(t, IsValidOverviewCoverFileName("0123456789abcdef0123456789abcdef.svg"))
	assert.False(t, IsValidOverviewCoverFileName("0123456789abcdef0123456789abcdef.exe"))
}

func TestOverviewCoverServiceSaveReadDeleteAndIsolation(t *testing.T) {
	tmpDir := t.TempDir()
	cfg := &settings.Config{
		StorageType: settings.LocalFileSystemObjectStorageType,
		LocalFileSystemPath: tmpDir,
	}

	err := storage.InitializeStorageContainer(cfg)
	assert.NoError(t, err)

	svc := &OverviewCoverService{
		ServiceUsingStorage: ServiceUsingStorage{
			container: storage.Container,
		},
	}

	ctx := core.NewNullContext()
	payload := []byte("fake-webp-bytes")
	file := &memoryMultipartFile{Reader: bytes.NewReader(payload)}

	fileName, err := svc.SaveOverviewCoverImage(ctx, 101, file, "webp")
	assert.NoError(t, err)
	assert.True(t, IsValidOverviewCoverFileName(fileName))

	// Owner can read
	data, contentType, err := svc.GetOverviewCoverImage(ctx, 101, fileName)
	assert.NoError(t, err)
	assert.Equal(t, "image/webp", contentType)
	assert.Equal(t, payload, data)

	// Another user cannot read owner's cover
	_, _, err = svc.GetOverviewCoverImage(ctx, 202, fileName)
	assert.Error(t, err)

	// Path traversal rejected
	_, _, err = svc.GetOverviewCoverImage(ctx, 101, "../101/"+fileName)
	assert.Error(t, err)

	// Owner can delete
	err = svc.DeleteOverviewCoverImage(ctx, 101, fileName)
	assert.NoError(t, err)

	// Reading after delete returns error
	_, _, err = svc.GetOverviewCoverImage(ctx, 101, fileName)
	assert.Error(t, err)

	// Deleting again is idempotent
	err = svc.DeleteOverviewCoverImage(ctx, 101, fileName)
	assert.NoError(t, err)

	// Unsupported extension rejected
	_, err = svc.SaveOverviewCoverImage(ctx, 101, &memoryMultipartFile{Reader: bytes.NewReader([]byte("x"))}, "svg")
	assert.Error(t, err)

	// Ensure interface compatibility
	var _ io.ReaderAt = &memoryMultipartFile{Reader: bytes.NewReader(nil)}
}
