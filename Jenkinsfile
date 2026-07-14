@Library(['SFE-RTC-pipeline']) _

node {
    withGitCredentials('jenkins-github-rtc') {
        git url: "https://github.com/SymphonyOSF/media-integrity-utils/", credentialsId: "jenkins-github-rtc", branch: "grooming-api"
    }
    withCredentials([
        [$class: "FileBinding", credentialsId: "sym-rtc-dev-jenkins-deploy-creds", variable: 'GOOGLE_APPLICATION_CREDENTIALS']
    ]) {
        sh "gcloud auth activate-service-account --key-file '${GOOGLE_APPLICATION_CREDENTIALS}'"
        sh "gcloud --quiet auth configure-docker us-east4-docker.pkg.dev"
        sh "docker build -t us-east4-docker.pkg.dev/sym-prod-mr-tools-01/rtc-docker-us-east4/grooming-api:latest ."
        sh "docker push us-east4-docker.pkg.dev/sym-prod-mr-tools-01/rtc-docker-us-east4/grooming-api:latest"
    }
}
