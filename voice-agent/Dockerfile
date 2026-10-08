FROM public.ecr.aws/lambda/python:3.11

# Copy dependency list
COPY requirements.txt ${LAMBDA_TASK_ROOT}

# Install dependencies into task root
RUN pip install --no-cache-dir -r requirements.txt --target "${LAMBDA_TASK_ROOT}"

# Copy application source code
COPY main.py ${LAMBDA_TASK_ROOT}

# Set the Lambda handler
CMD [ "main.handler" ]
