import { Body, Controller, Headers, HttpCode, HttpStatus, Post, Res } from '@nestjs/common';
import { ApiCreatedResponse, ApiHeader } from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser } from '../auth/session/access.decorators';
import type { SessionUser } from '../auth/session/session-user.repository';
import { problemDetailsResponse } from '../common/problem-details/problem-details.swagger';
import { CreateQuestionDto } from './dto/create-question.dto';
import { QuestionResponseDto } from './dto/question-response.dto';
import { QuestionsService } from './questions.service';

/** Questions (M2). Logged-in, active accounts only: the global SessionGuard enforces it (R13). */
@Controller('questions')
export class QuestionsController {
  constructor(private readonly questions: QuestionsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiHeader({
    name: 'idempotency-key',
    required: false,
    description: 'Repeated with the same text, returns the first response. Same key, other text: 422 (section 9.1).',
  })
  @ApiCreatedResponse({
    description: 'The question.',
    type: QuestionResponseDto,
    headers: { Location: { description: 'Path of the new question.', schema: { type: 'string' } } },
  })
  @problemDetailsResponse(400, 'Malformed request, such as an empty Idempotency-Key.')
  @problemDetailsResponse(401, 'Not logged in.')
  @problemDetailsResponse(403, 'The account is not active (suspended, pending verification or pending deletion).')
  @problemDetailsResponse(422, 'The text is empty or longer than 280 characters, or the key was used for another text.')
  @problemDetailsResponse(429, 'Too many requests.')
  async create(
    @CurrentUser() author: SessionUser,
    @Body() body: CreateQuestionDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<QuestionResponseDto> {
    const question = await this.questions.create(author, body, idempotencyKey);
    response.setHeader('Location', `/api/v1/questions/${question.id}`);

    return question;
  }
}
