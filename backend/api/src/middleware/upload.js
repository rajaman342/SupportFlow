import multer from 'multer';
import { getConfig, InvalidFileError } from '@supportflow/shared';

const config = getConfig();

const memoryStorage = multer.memoryStorage();

const upload = multer({
  storage: memoryStorage,
  limits: {
    fileSize: config.MAX_UPLOAD_MB * 1024 * 1024,
    files: 1
  },
  fileFilter: (_req, file, cb) => {
    if (!file.originalname.toLowerCase().endsWith('.pdf')) {
      return cb(new InvalidFileError('Only .pdf files are accepted', 'INVALID_FILE'));
    }
    if (file.mimetype.toLowerCase() !== 'application/pdf') {
      return cb(new InvalidFileError('MIME type must be application/pdf', 'INVALID_FILE'));
    }
    cb(null, true);
  }
});

export function handlePdfUpload(fieldName = 'file') {
  const single = upload.single(fieldName);

  return (req, res, next) => {
    single(req, res, (err) => {
      if (err) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return next(
            new InvalidFileError(
              `File exceeds the maximum allowed size of ${config.MAX_UPLOAD_MB}MB`,
              'FILE_TOO_LARGE'
            )
          );
        }
        if (err instanceof InvalidFileError) {
          return next(err);
        }
        return next(new InvalidFileError(err.message, 'INVALID_FILE'));
      }
      next();
    });
  };
}
