import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Logger,
  Post,
  Req,
  Res,
  Session,
  UseGuards,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { SessionData } from 'express-session';

import { MatchingHeaders } from '@/decorators/MatchingHeaders';
import { MatchingHeadersGuard } from '@/guards/MatchingHeaderGuard';
import { DOWNLOAD_SERVICES_TOKEN } from '@/providers/downloadServices';
import { DownloadService } from '@/services/download';

@Controller()
export class AuthController {
  private readonly logger = new Logger(AuthController.name);
  // Map simple en mémoire : OTP → est-il validé ?
  private validatedOTPs = new Map<string, boolean>();

  constructor(
    @Inject(DOWNLOAD_SERVICES_TOKEN)
    private readonly downloadServices: DownloadService[],
  ) {}

  @Get('/')
  home(@Session() session: SessionData, @Res() res: Response): void {
    if (session.validated) {
      res.redirect('/form');
      return;
    }
    res.redirect('/auth');
  }

  @Get('/auth')
  showOtp(@Session() session: SessionData, @Res() res: Response): void {
    // Si déjà validé, rediriger
    if (session.validated) {
      res.redirect('/form');
      return;
    }

    // Générer OTP si pas encore fait
    if (!session.otp) {
      session.otp = Math.floor(100000 + Math.random() * 900000).toString();
      this.logger.log(`Generated OTP: ${session.otp}`);
    }

    // Render the Handlebars template
    res.render('otp', { otp: session.otp });
  }

  @Get('/auth/status')
  checkStatus(@Session() session: SessionData): { validated: boolean } {
    // Vérifier si l'OTP a été validé dans la Map
    if (session.otp && this.validatedOTPs.get(session.otp)) {
      // Mettre à jour LE COOKIE de celui qui fait le polling
      session.validated = true;
      this.logger.log(`Session validated for OTP: ${session.otp}`);
      // Nettoyer la Map
      this.validatedOTPs.delete(session.otp);
      return { validated: true };
    }

    return { validated: session.validated || false };
  }

  @Post('/auth/validate')
  @MatchingHeaders([{ headerKey: 'x-api-key', configPath: 'server.apiKey' }])
  @UseGuards(MatchingHeadersGuard)
  validateOtp(@Body() body: { otp: string }): { success: boolean } {
    if (!body.otp) {
      throw new BadRequestException('OTP is required');
    }

    this.logger.log(`Validating OTP: ${body.otp}`);
    // Marquer l'OTP comme validé dans la Map
    this.validatedOTPs.set(body.otp, true);

    // Nettoyer après 1 minute (au cas où pas de polling)
    setTimeout(() => {
      this.validatedOTPs.delete(body.otp);
    }, 60000);

    return { success: true };
  }

  @Get('/form')
  showForm(@Session() session: SessionData, @Res() res: Response): void {
    if (!session.validated) {
      res.redirect('/auth');
      return;
    }
    res.render('form');
  }

  @Post('/submit')
  async submitDownload(
    @Session() session: SessionData,
    @Body() body: { url: string },
    @Res() res: Response,
  ): Promise<void> {
    if (!session.validated) {
      res.redirect('/auth');
      return;
    }

    if (!body.url) {
      throw new BadRequestException('URL is required');
    }

    // Find appropriate download service
    const service = this.downloadServices.find((s) => s.canDownload(body.url));
    if (!service) {
      throw new BadRequestException('No download service available for this URL');
    }

    // Get media info and start download
    const infos = await service.getMediaInfo(body.url);
    const downloadItem = await service.download({ url: body.url, ...infos });

    this.logger.log(`Download started: ${downloadItem.fileName}`);

    // Redirect back to form with success message
    res.redirect('/form?success=true');
  }

  @Post('/auth/logout')
  logout(@Req() req: Request, @Res() res: Response): void {
    req.session.destroy((err) => {
      if (err) {
        this.logger.error('Error destroying session:', err);
      }
      res.clearCookie('downloader.sid');
      res.redirect('/');
    });
  }
}
