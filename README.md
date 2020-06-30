# ETDB-Downloads

This is an example of third party command line application written in `nodejs` to download data from ETDB-Caltech. The goal here is not only provide the functionality for bulk download but also to exemplify how a simple app can be made to leverage the distributed nature of ETDB.

For this reason, we wrote two tutorials: One for users and one for developers. Please feel free to post issues as this is still a beta release.

## Tutorials and manuals

[User Manual](https://github.com/theJensenLab/etdb-bulk-download/blob/master/userManual.md)  
[Developer Tutorial (todo)](https://github.com/theJensenLab/etdb-bulk-download/blob/master/developerManual.md)

# ETDB-downloads
## 1.安装make g++ gcc

	sudo apt install make g++ gcc python git tmux

## 2.按照Github上的手册安装。
参考链接：
	
	https://github.com/theJensenLab/etdb-downloads/blob/master/userManual.md

### 2.1 安装nodejs

	curl -o- https://raw.githubusercontent.com/creationix/nvm/v0.33.11/install.sh | zsh # 如果用的 bash 这里就是 bash
	
or
	wget https://raw.githubusercontent.com/creationix/nvm/v0.33.11/install.sh
	zsh install.sh


	nvm install 9.10.1
	nvm alias default 9.10.1

测试安装：
	
	node
	2+2

### 2.2 npm换淘宝的源。

	npm config set registry https://registry.npm.taobao.org

### 2.3 安装ETDB-downloads

	npm i bufferutil
	npm i utf-8-validate
	npm install -g etdb-downloads

测试安装：

	etdb-downloads -h

