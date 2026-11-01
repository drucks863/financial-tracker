package app.financetracker

import com.amazonaws.serverless.proxy.model.AwsProxyResponse
import com.amazonaws.serverless.proxy.model.HttpApiV2ProxyRequest
import com.amazonaws.serverless.proxy.spring.SpringBootLambdaContainerHandler
import com.amazonaws.services.lambda.runtime.Context
import com.amazonaws.services.lambda.runtime.RequestStreamHandler
import java.io.InputStream
import java.io.OutputStream

/**
 * Entry point on AWS Lambda (function URL, payload format 2.0). The Spring context starts while the
 * class loads, which is the part SnapStart snapshots, so a cold start resumes an already started app.
 * Locally and in tests the app still runs on Tomcat through main().
 */
class LambdaHandler : RequestStreamHandler {
    override fun handleRequest(input: InputStream, output: OutputStream, context: Context) {
        springHandler.proxyStream(input, output, context)
    }

    companion object {
        private val springHandler: SpringBootLambdaContainerHandler<HttpApiV2ProxyRequest, AwsProxyResponse> =
            SpringBootLambdaContainerHandler.getHttpApiV2ProxyHandler(FinanceTrackerApplication::class.java)
    }
}
