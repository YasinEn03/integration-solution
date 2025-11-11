import { ArgumentsHost, Catch, ExceptionFilter, HttpException } from '@nestjs/common';

@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  catch(exception: any, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse();
    const req = ctx.getRequest();
    const status = exception instanceof HttpException ? exception.getStatus() : 500;
    const message = exception instanceof HttpException ? exception.message : 'Internal Server Error';

    res
      .status(status)
      .type('application/problem+json')
      .send({
        type: 'about:blank',
        title: message,
        status,
        detail: exception.response?.message ?? message,
        instance: req.originalUrl,
        correlationId: req.correlationId,
      });
  }
}
