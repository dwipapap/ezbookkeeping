package api

import (
	"strings"

	"github.com/mayswind/ezbookkeeping/pkg/core"
	"github.com/mayswind/ezbookkeeping/pkg/errs"
	"github.com/mayswind/ezbookkeeping/pkg/log"
	"github.com/mayswind/ezbookkeeping/pkg/services"
	"github.com/mayswind/ezbookkeeping/pkg/settings"
	"github.com/mayswind/ezbookkeeping/pkg/utils"
)

const maxOverviewCoverFileSize int64 = 5 * 1024 * 1024 // 5 MiB

// OverviewCoverUploadResponse represents the uploaded overview cover response
type OverviewCoverUploadResponse struct {
	FileName string `json:"fileName"`
}

// OverviewCoverDeleteRequest represents the delete overview cover request
type OverviewCoverDeleteRequest struct {
	FileName string `json:"fileName" binding:"required"`
}

// OverviewCoversApi represents overview cover images api
type OverviewCoversApi struct {
	ApiUsingConfig
	covers *services.OverviewCoverService
}

// OverviewCovers is the singleton instance of OverviewCoversApi
var (
	OverviewCovers = &OverviewCoversApi{
		ApiUsingConfig: ApiUsingConfig{
			container: settings.Container,
		},
		covers: services.OverviewCovers,
	}
)

// OverviewCoverUploadHandler saves a new overview widget cover image for the current user
func (a *OverviewCoversApi) OverviewCoverUploadHandler(c *core.WebContext) (any, *errs.Error) {
	uid := c.GetCurrentUid()

	form, err := c.MultipartForm()

	if err != nil {
		log.Errorf(c, "[overview_covers.OverviewCoverUploadHandler] failed to get multi-part form data for user \"uid:%d\", because %s", uid, err.Error())
		return nil, errs.ErrParameterInvalid
	}

	coverFiles := form.File["cover"]

	if len(coverFiles) < 1 {
		log.Warnf(c, "[overview_covers.OverviewCoverUploadHandler] there is no cover image in request for user \"uid:%d\"", uid)
		return nil, errs.ErrParameterInvalid
	}

	if coverFiles[0].Size < 1 {
		log.Warnf(c, "[overview_covers.OverviewCoverUploadHandler] cover image size is zero for user \"uid:%d\"", uid)
		return nil, errs.ErrParameterInvalid
	}

	if coverFiles[0].Size > maxOverviewCoverFileSize {
		log.Warnf(c, "[overview_covers.OverviewCoverUploadHandler] cover image size \"%d\" exceeds maximum size \"%d\" for user \"uid:%d\"", coverFiles[0].Size, maxOverviewCoverFileSize, uid)
		return nil, errs.ErrExceedMaxTransactionPictureFileSize
	}

	fileExtension := strings.ToLower(utils.GetFileNameExtension(coverFiles[0].Filename))

	if utils.GetImageContentType(fileExtension) == "" {
		log.Warnf(c, "[overview_covers.OverviewCoverUploadHandler] unsupported cover image extension \"%s\" for user \"uid:%d\"", fileExtension, uid)
		return nil, errs.ErrImageTypeNotSupported
	}

	coverFile, err := coverFiles[0].Open()

	if err != nil {
		log.Errorf(c, "[overview_covers.OverviewCoverUploadHandler] failed to open uploaded cover file for user \"uid:%d\", because %s", uid, err.Error())
		return nil, errs.ErrOperationFailed
	}

	fileName, err := a.covers.SaveOverviewCoverImage(c, uid, coverFile, fileExtension)

	if err != nil {
		log.Errorf(c, "[overview_covers.OverviewCoverUploadHandler] failed to save cover image for user \"uid:%d\", because %s", uid, err.Error())
		return nil, errs.Or(err, errs.ErrOperationFailed)
	}

	log.Infof(c, "[overview_covers.OverviewCoverUploadHandler] user \"uid:%d\" uploaded overview cover \"%s\"", uid, fileName)

	return &OverviewCoverUploadResponse{
		FileName: fileName,
	}, nil
}

// OverviewCoverDeleteHandler deletes an overview cover image for the current user
func (a *OverviewCoversApi) OverviewCoverDeleteHandler(c *core.WebContext) (any, *errs.Error) {
	var req OverviewCoverDeleteRequest

	if err := c.ShouldBindJSON(&req); err != nil {
		log.Warnf(c, "[overview_covers.OverviewCoverDeleteHandler] parse request failed, because %s", err.Error())
		return nil, errs.NewIncompleteOrIncorrectSubmissionError(err)
	}

	uid := c.GetCurrentUid()

	if err := a.covers.DeleteOverviewCoverImage(c, uid, req.FileName); err != nil {
		log.Errorf(c, "[overview_covers.OverviewCoverDeleteHandler] failed to delete cover image \"%s\" for user \"uid:%d\", because %s", req.FileName, uid, err.Error())
		return nil, errs.Or(err, errs.ErrOperationFailed)
	}

	log.Infof(c, "[overview_covers.OverviewCoverDeleteHandler] user \"uid:%d\" deleted overview cover \"%s\"", uid, req.FileName)

	return true, nil
}

// OverviewCoverGetHandler returns the overview cover image bytes for the current user
func (a *OverviewCoversApi) OverviewCoverGetHandler(c *core.WebContext) ([]byte, string, *errs.Error) {
	uid := c.GetCurrentUid()
	fileName := c.Param("fileName")

	data, contentType, err := a.covers.GetOverviewCoverImage(c, uid, fileName)

	if err != nil {
		if !errs.IsCustomError(err) {
			log.Errorf(c, "[overview_covers.OverviewCoverGetHandler] failed to get cover image \"%s\" for user \"uid:%d\", because %s", fileName, uid, err.Error())
		}

		return nil, "", errs.Or(err, errs.ErrOperationFailed)
	}

	c.Header("Cache-Control", "private, max-age=31536000, immutable")
	return data, contentType, nil
}
