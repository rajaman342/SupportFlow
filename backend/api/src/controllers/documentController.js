import { documentService, InvalidFileError } from '@supportflow/shared';

export class DocumentController {
  async upload(req, res, next) {
    try {
      if (!req.file) {
        throw new InvalidFileError('A PDF file must be provided');
      }

      const { title } = req.body;
      const result = await documentService.uploadDocument({
        organizationId: req.user.organizationId,
        userId: req.user.id,
        title,
        fileBuffer: req.file.buffer,
        originalFilename: req.file.originalname,
        mimeType: req.file.mimetype
      });

      res.status(202).json({ data: result });
    } catch (err) {
      next(err);
    }
  }

  async list(req, res, next) {
    try {
      const { q, status, page, limit } = req.query;
      const result = await documentService.listDocuments(req.user.organizationId, {
        q,
        status,
        page,
        limit
      });

      res.status(200).json({
        data: result.items,
        meta: {
          page: result.page,
          limit: result.limit,
          total: result.total,
          totalPages: result.pages
        }
      });
    } catch (err) {
      next(err);
    }
  }

  async getById(req, res, next) {
    try {
      const doc = await documentService.getDocument(req.params.id, req.user.organizationId);
      res.status(200).json({ data: doc });
    } catch (err) {
      next(err);
    }
  }

  async listVersions(req, res, next) {
    try {
      const versions = await documentService.listVersions(req.params.id, req.user.organizationId);
      res.status(200).json({ data: versions });
    } catch (err) {
      next(err);
    }
  }

  async replaceFile(req, res, next) {
    try {
      if (!req.file) {
        throw new InvalidFileError('A replacement PDF file must be provided');
      }

      const result = await documentService.replaceDocumentFile({
        documentId: req.params.id,
        organizationId: req.user.organizationId,
        userId: req.user.id,
        fileBuffer: req.file.buffer,
        originalFilename: req.file.originalname,
        mimeType: req.file.mimetype
      });

      res.status(202).json({ data: result });
    } catch (err) {
      next(err);
    }
  }

  async reindex(req, res, next) {
    try {
      const result = await documentService.reindexDocument({
        documentId: req.params.id,
        organizationId: req.user.organizationId,
        userId: req.user.id
      });

      res.status(202).json({ data: result });
    } catch (err) {
      next(err);
    }
  }

  async createDownloadUrl(req, res, next) {
    try {
      const { version } = req.query;
      const result = await documentService.createDownloadUrl({
        documentId: req.params.id,
        versionParam: version,
        organizationId: req.user.organizationId,
        userId: req.user.id
      });

      res.status(200).json({ data: result });
    } catch (err) {
      next(err);
    }
  }

  async downloadFile(req, res, next) {
    try {
      const { token, exp, versionId } = req.query;
      const fileData = await documentService.getFileBySignedToken({
        documentId: req.params.id,
        versionId,
        token,
        exp
      });

      res.setHeader('Content-Type', fileData.mimeType);
      res.setHeader(
        'Content-Disposition',
        `inline; filename="${encodeURIComponent(fileData.filename)}"`
      );
      res.setHeader('Content-Length', fileData.sizeBytes);

      res.send(fileData.buffer);
    } catch (err) {
      next(err);
    }
  }

  async delete(req, res, next) {
    try {
      await documentService.deleteDocument(
        req.params.id,
        req.user.organizationId,
        req.user.id
      );

      res.status(204).end();
    } catch (err) {
      next(err);
    }
  }
}

export const documentController = new DocumentController();
