import { offerLetterService } from '../services/offerLetter.service';
import { asyncHandler } from '../utils/helpers';
import { sendPdf, v } from '../utils/http';

export const offerLetterController = {
  download: asyncHandler(async (req, res) => {
    const { fullPath, filename } = await offerLetterService.download(v(res).params.id, req.user!);
    sendPdf(res, fullPath, filename);
  }),
};
