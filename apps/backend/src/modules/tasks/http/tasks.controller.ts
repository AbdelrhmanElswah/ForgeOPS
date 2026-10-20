import {
  type CreateTaskRequest,
  CreateTaskRequestSchema,
  type CreateTaskResponse,
  CreateTaskResponseSchema,
  IdSchema,
  type ListTasksQuery,
  ListTasksQuerySchema,
  type Task,
  type TaskPage,
  TaskPageSchema,
  TaskSchema,
} from '@forgeops/contracts';
import { Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { Idempotent } from '../../../common/http/idempotency.interceptor.js';
import {
  ApiProblemResponses,
  ApiZodBody,
  ApiZodQuery,
  ApiZodResponse,
} from '../../../common/openapi/zod-openapi.js';
import { ZodBody, ZodParam, ZodQuery } from '../../../common/validation/zod-validation.pipe.js';
import { type AuthenticatedUser, CurrentUser } from '../../auth/http/auth.decorators.js';
import { CancelTaskUseCase } from '../application/cancel-task.use-case.js';
import { CreateTaskUseCase } from '../application/create-task.use-case.js';
import { TaskQueries, toTaskDto } from '../application/task.queries.js';

@ApiTags('tasks')
@Controller('tasks')
export class TasksController {
  constructor(
    private readonly createTask: CreateTaskUseCase,
    private readonly cancelTask: CancelTaskUseCase,
    private readonly queries: TaskQueries,
  ) {}

  /** 202 Accepted: the task is saved and queued; the agents run later, in the Worker. */
  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  @Idempotent()
  @ApiOperation({ summary: 'Create a task and queue it for the agents' })
  @ApiZodBody(CreateTaskRequestSchema)
  @ApiZodResponse(202, CreateTaskResponseSchema)
  @ApiProblemResponses(400, 401, 403, 404, 409, 422, 503)
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @ZodBody(CreateTaskRequestSchema) body: CreateTaskRequest,
  ): Promise<CreateTaskResponse> {
    const task = await this.createTask.execute(user.id, body);
    return { id: task.id, status: task.status };
  }

  @Get()
  @ApiOperation({ summary: 'Your tasks, newest first' })
  @ApiZodQuery(ListTasksQuerySchema)
  @ApiZodResponse(200, TaskPageSchema)
  @ApiProblemResponses(400, 401)
  list(
    @CurrentUser() user: AuthenticatedUser,
    @ZodQuery(ListTasksQuerySchema) query: ListTasksQuery,
  ): Promise<TaskPage> {
    return this.queries.list(user.id, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Task details and status' })
  @ApiZodResponse(200, TaskSchema)
  @ApiProblemResponses(400, 401, 404)
  get(@CurrentUser() user: AuthenticatedUser, @ZodParam('id', IdSchema) id: string): Promise<Task> {
    return this.queries.get(user.id, id);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel a task (running tasks stop at the next safe point)' })
  @ApiZodResponse(200, TaskSchema)
  @ApiProblemResponses(400, 401, 403, 404, 409)
  async cancel(
    @CurrentUser() user: AuthenticatedUser,
    @ZodParam('id', IdSchema) id: string,
  ): Promise<Task> {
    return toTaskDto(await this.cancelTask.execute(user.id, id));
  }
}
