package services

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"io"
	"mime/multipart"
	"regexp"
	"strings"

	"github.com/mayswind/ezbookkeeping/pkg/core"
	"github.com/mayswind/ezbookkeeping/pkg/errs"
	"github.com/mayswind/ezbookkeeping/pkg/storage"
	"github.com/mayswind/ezbookkeeping/pkg/utils"
)

var overviewCoverFileNamePattern = regexp.MustCompile(`^[0-9a-f]{32}\.(jpg|jpeg|png|gif|webp)$`)

// OverviewCoverService manages user-uploaded overview widget cover images
type OverviewCoverService struct {
	ServiceUsingStorage
}

// OverviewCovers is the singleton instance of OverviewCoverService
var (
	OverviewCovers = &OverviewCoverService{
		ServiceUsingStorage: ServiceUsingStorage{
			container: storage.Container,
		},
	}
)

// IsValidOverviewCoverFileName checks whether a cover filename matches the strict generated format
func IsValidOverviewCoverFileName(fileName string) bool {
	return overviewCoverFileNamePattern.MatchString(fileName)
}

// SaveOverviewCoverImage stores a cover image for a user and returns the generated file name
func (s *OverviewCoverService) SaveOverviewCoverImage(c core.Context, uid int64, file multipart.File, fileExtension string) (string, error) {
	if uid <= 0 {
		return "", errs.ErrUserIdInvalid
	}

	defer file.Close()

	ext := strings.ToLower(strings.TrimPrefix(fileExtension, "."))

	if utils.GetImageContentType(ext) == "" {
		return "", errs.ErrImageTypeNotSupported
	}

	randomBytes := make([]byte, 16)

	if _, err := rand.Read(randomBytes); err != nil {
		return "", err
	}

	fileName := fmt.Sprintf("%s.%s", hex.EncodeToString(randomBytes), ext)

	if err := s.SaveOverviewCover(c, uid, fileName, file); err != nil {
		return "", err
	}

	return fileName, nil
}

// GetOverviewCoverImage returns the raw image bytes and content type for a user's overview cover
func (s *OverviewCoverService) GetOverviewCoverImage(c core.Context, uid int64, fileName string) ([]byte, string, error) {
	if uid <= 0 {
		return nil, "", errs.ErrUserIdInvalid
	}

	if !IsValidOverviewCoverFileName(fileName) {
		return nil, "", errs.ErrParameterInvalid
	}

	ext := strings.ToLower(utils.GetFileNameExtension(fileName))
	contentType := utils.GetImageContentType(ext)

	if contentType == "" {
		return nil, "", errs.ErrImageTypeNotSupported
	}

	fileObj, exists, err := s.ReadOverviewCover(c, uid, fileName)

	if err != nil {
		return nil, "", err
	}

	if !exists {
		return nil, "", errs.ErrApiNotFound
	}

	defer fileObj.Close()

	data, err := io.ReadAll(fileObj)

	if err != nil {
		return nil, "", err
	}

	return data, contentType, nil
}

// DeleteOverviewCoverImage removes a cover image belonging to the user
func (s *OverviewCoverService) DeleteOverviewCoverImage(c core.Context, uid int64, fileName string) error {
	if uid <= 0 {
		return errs.ErrUserIdInvalid
	}

	if !IsValidOverviewCoverFileName(fileName) {
		return errs.ErrParameterInvalid
	}

	exists, err := s.ExistsOverviewCover(c, uid, fileName)

	if err != nil {
		return err
	}

	if !exists {
		return nil
	}

	return s.DeleteOverviewCover(c, uid, fileName)
}
